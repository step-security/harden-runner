import * as core from "@actions/core";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { EOL } from "os";
import { context } from "@actions/github";
import { isGHES } from "./common";
import { SECURE_REGISTRY_AUDIENCE, STEPSECURITY_API_URL } from "./configs";
import {
  describeRegistry,
  findEnv,
  isDefaultRegistry,
  mergeNpmrc,
  unscopedRegistry,
} from "./npmrc";

// Session creation can take longer than the other API calls.
const SESSION_TIMEOUT_MS = 10000;

const SKIP_SUFFIX = "npm stays on the default registry.";

interface SessionNotice {
  source?: string;
  path?: string;
  code?: string;
  message: string;
}

interface SessionResponse {
  token?: string;
  expires_at?: number;
  // How the session is tied to this job: oidc, hr_key or none. Set whenever a
  // token is minted.
  binding?: string;
  edition?: string;
  registries?: Record<string, string>;
  config?: Record<string, { mode?: string; lockfile_resolved?: string; cooldown?: { days?: number } }>;
  notices?: SessionNotice[];
}

// Why the session gave npm no registry. The resolved config leaves out every
// ecosystem not listed in `ecosystems`, and keeps a covered one with mode off.
export function npmNotConfiguredReason(session: SessionResponse): string {
  if (session.config?.npm) {
    return "npm is off";
  }
  return "npm is not listed in ecosystems";
}

// The Harden-Runner correlation ID and the one-time key /monitor issued for
// it. A session created without an OIDC token is linked to the job only when
// it carries both.
export interface JobBinding {
  correlationId?: string;
  oneTimeKey?: string;
}

// The job identity sent when no OIDC token is available.
export type DeclaredClaims = Record<string, string>;

export type SessionAuth =
  | { kind: "oidc"; idToken: string; refreshIDToken: () => Promise<string> }
  | { kind: "declared"; claims: DeclaredClaims };

interface SessionError {
  code?: string;
  error?: string;
  reason?: string;
}

export interface SessionHttpResult {
  status: number;
  body: unknown;
  retryAfter?: string;
}

export interface SecureRegistryResult {
  // "<host>:<port>" of the registry npm now uses, for allowed-endpoints.
  registryEndpoint?: string;
}

interface NpmSource {
  path: string;
  content: string;
  // The env var that named the source file, if any, so the export reuses it
  // instead of leaving two conflicting spellings set.
  envKey?: string;
}

type Preflight = { ok: true; source: NpmSource } | { ok: false; reason: string };

// Returns the raw input to send to the session API, or undefined when the
// feature is off. The action applies no defaults of its own.
export function secureRegistryInput(raw: string): string | undefined {
  const value = raw.trim();
  if (value === "" || value.toLowerCase() === "false") {
    return undefined;
  }
  return value;
}

interface EventPayload {
  repository?: { full_name?: string; visibility?: string; private?: boolean };
  pull_request?: { head?: { repo?: { full_name?: string } | null } };
}

// GitHub gives fork pull_request runs no OIDC token even with id-token: write.
export function missingTokenReason(eventName: string, payload: EventPayload): string {
  if (eventName === "pull_request") {
    const head = payload?.pull_request?.head?.repo?.full_name;
    const base = payload?.repository?.full_name;
    if (!head || head !== base) {
      return "fork pull request, no OIDC token available";
    }
  }
  return "no id-token: write permission";
}

// Mirrors the session API's checks for declared claims, so a request that
// would only get a 400 is not sent.
const MAX_CLAIM_LENGTH = 512;
const NUMERIC = /^[0-9]+$/;
const GITHUB_NAME = /^[A-Za-z0-9._-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REQUIRED_CLAIMS = [
  "repository",
  "repository_id",
  "repository_owner",
  "repository_owner_id",
  "run_id",
  "run_attempt",
  "check_run_id",
  "repository_visibility",
  "runner_environment",
];
const NUMERIC_CLAIMS = new Set([
  "repository_id",
  "repository_owner_id",
  "run_id",
  "run_attempt",
  "check_run_id",
  "actor_id",
]);

function repositoryVisibility(payload: EventPayload): string | undefined {
  const repository = payload?.repository;
  if (repository?.visibility) {
    return repository.visibility;
  }
  if (typeof repository?.private === "boolean") {
    return repository.private ? "private" : "public";
  }
  return undefined;
}

// Builds the job identity from the runner environment. checkRunId comes from
// the action's check-run-id input (${{ job.check_run_id }}): no environment
// variable carries it.
export function buildDeclaredClaims(
  env: NodeJS.ProcessEnv,
  payload: EventPayload,
  checkRunId: string
): { ok: true; claims: DeclaredClaims } | { ok: false; reason: string } {
  const candidates: Record<string, string | undefined> = {
    repository: env.GITHUB_REPOSITORY,
    repository_id: env.GITHUB_REPOSITORY_ID,
    repository_owner: env.GITHUB_REPOSITORY_OWNER,
    repository_owner_id: env.GITHUB_REPOSITORY_OWNER_ID,
    run_id: env.GITHUB_RUN_ID,
    run_attempt: env.GITHUB_RUN_ATTEMPT,
    check_run_id: checkRunId,
    repository_visibility: repositoryVisibility(payload),
    runner_environment: env.RUNNER_ENVIRONMENT,
    actor: env.GITHUB_ACTOR,
    actor_id: env.GITHUB_ACTOR_ID,
    event_name: env.GITHUB_EVENT_NAME,
    ref: env.GITHUB_REF,
    head_ref: env.GITHUB_HEAD_REF,
    sha: env.GITHUB_SHA,
    workflow_ref: env.GITHUB_WORKFLOW_REF,
  };

  const claims: DeclaredClaims = {};
  for (const [name, raw] of Object.entries(candidates)) {
    const value = (raw ?? "").trim();
    const required = REQUIRED_CLAIMS.includes(name);
    const valid =
      value !== "" &&
      value.length <= MAX_CLAIM_LENGTH &&
      (!NUMERIC_CLAIMS.has(name) || NUMERIC.test(value));
    if (valid) {
      claims[name] = value;
    } else if (required) {
      return { ok: false, reason: value === "" ? `${name} is missing` : `${name} is malformed` };
    }
    // An optional claim that is empty or malformed is left out.
  }

  const [owner, repo, ...rest] = claims.repository.split("/");
  if (rest.length > 0 || !GITHUB_NAME.test(owner ?? "") || !GITHUB_NAME.test(repo ?? "")) {
    return { ok: false, reason: "repository is malformed" };
  }
  if (owner.toLowerCase() !== claims.repository_owner.toLowerCase()) {
    return { ok: false, reason: "repository_owner does not match repository" };
  }
  return { ok: true, claims };
}

// Whether the pre step reaches the /monitor call on its main path. Must match
// the early returns in setup.ts that come before /monitor: ARC, self-hosted
// (including third-party providers), a custom VM image with Harden-Runner
// baked in, and an agent that is already installed. When it does, the
// session is created after /monitor so it can carry the one-time key.
export function sessionWaitsForMonitor(runner: {
  arc: boolean;
  githubHosted: boolean;
  customVMImage: boolean;
  agentInstalled: boolean;
}): boolean {
  return !runner.arc && runner.githubHosted && !runner.customVMImage && !runner.agentInstalled;
}

function npmGlobalConfigPath(env: NodeJS.ProcessEnv): string | undefined {
  const fromEnv = findEnv(env, "npm_config_globalconfig");
  if (fromEnv) {
    return fromEnv.value;
  }
  try {
    const out = cp.execSync("npm config get globalconfig", {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() || undefined;
  } catch (e) {
    core.debug(`secure-registry: unable to locate the global npm config: ${e}`);
    return undefined;
  }
}

// Decides, before any token is minted, whether npm can be switched without
// overriding a registry the user configured on purpose.
export function npmPreflight(
  env: NodeJS.ProcessEnv,
  homeDir: string,
  globalConfigPath: (env: NodeJS.ProcessEnv) => string | undefined = npmGlobalConfigPath
): Preflight {
  const envRegistry = findEnv(env, "npm_config_registry");
  if (envRegistry) {
    return {
      ok: false,
      reason: `${envRegistry.key} is set (${describeRegistry(envRegistry.value)})`,
    };
  }

  const userConfig = findEnv(env, "npm_config_userconfig");
  const sourcePath = userConfig ? userConfig.value : path.join(homeDir, ".npmrc");
  const content = fs.existsSync(sourcePath)
    ? fs.readFileSync(sourcePath, "utf8")
    : "";
  const userRegistry = unscopedRegistry(content);
  if (userRegistry !== undefined && !isDefaultRegistry(userRegistry)) {
    return {
      ok: false,
      reason: `${sourcePath} sets registry to ${describeRegistry(userRegistry)}`,
    };
  }

  const globalPath = globalConfigPath(env);
  if (globalPath) {
    try {
      if (fs.existsSync(globalPath)) {
        const globalRegistry = unscopedRegistry(fs.readFileSync(globalPath, "utf8"));
        if (globalRegistry !== undefined && !isDefaultRegistry(globalRegistry)) {
          return {
            ok: false,
            reason: `the global npm config ${globalPath} sets registry to ${describeRegistry(globalRegistry)}`,
          };
        }
      }
    } catch (e) {
      core.debug(`secure-registry: unable to read ${globalPath}: ${e}`);
    }
  }

  return {
    ok: true,
    source: { path: sourcePath, content, envKey: userConfig?.key },
  };
}

function errorCode(body: unknown): string | undefined {
  return (body as SessionError | undefined)?.code;
}

async function postSession(request: Record<string, unknown>): Promise<SessionHttpResult> {
  const resp = await fetch(`${STEPSECURITY_API_URL}/secure-registry/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(SESSION_TIMEOUT_MS),
  });
  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    body = undefined;
  }
  return {
    status: resp.status,
    body,
    retryAfter: resp.headers.get("retry-after") ?? undefined,
  };
}

// The request body. The correlation ID is sent only when it is a UUID, and
// the key only next to it.
function sessionBody(config: string, auth: SessionAuth, job: JobBinding): Record<string, unknown> {
  const body: Record<string, unknown> = { config };
  const correlationId = job.correlationId && UUID.test(job.correlationId) ? job.correlationId : undefined;
  if (correlationId) {
    body.correlation_id = correlationId;
  }
  if (auth.kind === "oidc") {
    body.oidc_token = auth.idToken;
  } else {
    body.claims = auth.claims;
    if (correlationId && job.oneTimeKey) {
      body.one_time_key = job.oneTimeKey;
    }
  }
  return body;
}

// The OIDC token lives 300s, so it is requested right before the call. An
// expired token is retried once with a fresh one; nothing else is retried.
export async function createSession(
  config: string,
  auth: SessionAuth,
  job: JobBinding = {}
): Promise<SessionHttpResult> {
  let result = await postSession(sessionBody(config, auth, job));
  if (auth.kind === "oidc" && result.status === 401 && errorCode(result.body) === "oidc_expired") {
    core.info("secure-registry: OIDC token expired before the session was created, retrying with a new token");
    const retry: SessionAuth = { ...auth, idToken: await auth.refreshIDToken() };
    result = await postSession(sessionBody(config, retry, job));
  }
  return result;
}

// Expected configuration states are notices; service problems are warnings.
// Neither fails the job.
export function describeSessionFailure(
  result: SessionHttpResult
): { level: "notice" | "warning"; message: string } {
  const err = (result.body ?? {}) as SessionError;
  switch (err.code) {
    case "not_eligible":
      if (err.reason === "visibility") {
        return { level: "notice", message: "the community edition is available for public repositories only" };
      }
      if (err.reason === "runner") {
        return { level: "notice", message: "the community edition is available on GitHub-hosted runners only" };
      }
      return { level: "notice", message: `this run is not eligible (${err.reason || "no reason given"})` };
    case "enterprise_not_supported":
      return { level: "notice", message: "not yet available for organizations with a StepSecurity subscription" };
    case "id_token_required":
      return {
        level: "notice",
        message:
          'organizations with a StepSecurity subscription need a verified job identity, add "permissions: id-token: write" to this job',
      };
    case "rate_limited":
      return {
        level: "warning",
        message: `session rate limit reached${result.retryAfter ? `, retry after ${result.retryAfter}s` : ""}`,
      };
    case "oidc_expired":
      return { level: "warning", message: "the OIDC token expired again before a session could be created" };
    case "oidc_replayed":
    case "oidc_invalid":
      return { level: "warning", message: `the session API rejected the OIDC token (${err.code})` };
    case "unavailable":
      return { level: "warning", message: "the session API is unavailable" };
    default:
      return {
        level: "warning",
        message: `session request failed with HTTP ${result.status}${err.code ? ` (${err.code}: ${err.error})` : ""}`,
      };
  }
}

function skipNotice(reason: string) {
  core.notice(`secure-registry: ${reason}. ${SKIP_SUFFIX}`);
}

function skipWarning(reason: string) {
  core.warning(`secure-registry: ${reason}. ${SKIP_SUFFIX}`);
}

function saveState(name: string, value: string) {
  fs.appendFileSync(process.env.GITHUB_STATE, `${name}=${value}${EOL}`, {
    encoding: "utf8",
  });
}

// Never logs the token: it is masked before this runs and is not part of
// any field printed here.
function printSession(session: SessionResponse) {
  core.startGroup("secure-registry session");
  core.info(`edition: ${session.edition}`);
  if (session.binding) {
    core.info(`binding: ${session.binding}`);
  }
  if (session.expires_at) {
    core.info(`expires at: ${new Date(session.expires_at * 1000).toISOString()}`);
  }
  core.info(`registries: ${JSON.stringify(session.registries ?? {})}`);
  core.info(`resolved config:\n${JSON.stringify(session.config ?? {}, null, 2)}`);
  core.endGroup();

  for (const notice of session.notices ?? []) {
    core.notice(
      `secure-registry: ${notice.message}${notice.path ? ` (${notice.path})` : ""}`
    );
  }
}

// Uses the job's OIDC token when there is one. Without it (no id-token: write,
// or a fork pull_request run), sends the job identity as declared claims.
async function sessionAuth(): Promise<{ ok: true; auth: SessionAuth } | { ok: false; reason: string }> {
  const getIDToken = () => core.getIDToken(SECURE_REGISTRY_AUDIENCE);
  let reason: string;
  if (process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
    try {
      return { ok: true, auth: { kind: "oidc", idToken: await getIDToken(), refreshIDToken: getIDToken } };
    } catch (e) {
      reason = `the OIDC token could not be fetched (${e instanceof Error ? e.message : e})`;
    }
  } else {
    reason = missingTokenReason(context.eventName, context.payload as EventPayload);
  }

  const declared = buildDeclaredClaims(
    process.env,
    context.payload as EventPayload,
    core.getInput("check-run-id")
  );
  if (declared.ok === false) {
    return {
      ok: false,
      reason: `${reason}, and the job identity is incomplete (${declared.reason})`,
    };
  }
  core.debug(
    `secure-registry: ${reason}, using declared claims; add "permissions: id-token: write" for verified attribution`
  );
  return { ok: true, auth: { kind: "declared", claims: declared.claims } };
}

async function configureNpm(config: string, job: JobBinding): Promise<SecureRegistryResult> {
  if (isGHES()) {
    skipNotice("not supported on GitHub Enterprise Server yet");
    return {};
  }

  const runnerTemp = process.env.RUNNER_TEMP;
  if (!runnerTemp) {
    skipNotice("RUNNER_TEMP is not set");
    return {};
  }

  const preflight = npmPreflight(process.env, os.homedir());
  if (preflight.ok === false) {
    skipNotice(preflight.reason);
    return {};
  }

  const auth = await sessionAuth();
  if (auth.ok === false) {
    skipNotice(auth.reason);
    return {};
  }

  const result = await createSession(config, auth.auth, job);
  if (result.status !== 200 && result.status !== 201) {
    const failure = describeSessionFailure(result);
    if (failure.level === "notice") {
      skipNotice(failure.message);
    } else {
      skipWarning(failure.message);
    }
    return {};
  }

  const session = (result.body ?? {}) as SessionResponse;
  if (session.token) {
    core.setSecret(session.token);
  }
  printSession(session);

  if (!session.token) {
    if (result.status === 201) {
      skipWarning("the session API returned no token");
    } else {
      core.info(`secure-registry: ${npmNotConfiguredReason(session)}, nothing to configure`);
    }
    return {};
  }

  // Saved before anything else can fail, so the post step can always revoke.
  saveState("srToken", session.token);
  saveState("srEdition", session.edition ?? "");
  saveState("srBinding", session.binding ?? "");

  if (session.binding === "none") {
    core.notice(
      'secure-registry: this job is not linked to run insights, so the packages it installs will not appear there. Add "permissions: id-token: write" to this job to link it.'
    );
  }

  for (const ecosystem of Object.keys(session.registries ?? {})) {
    if (ecosystem !== "npm") {
      core.info(`secure-registry: this version of Harden-Runner configures npm only, ignoring ${ecosystem}`);
    }
  }

  const registryUrl = session.registries?.npm;
  if (!registryUrl) {
    core.info(`secure-registry: ${npmNotConfiguredReason(session)}, nothing to configure`);
    return {};
  }
  let registry: URL;
  try {
    registry = new URL(registryUrl);
  } catch {
    skipWarning(`the session API returned an invalid npm registry URL`);
    return {};
  }
  if (registry.protocol !== "https:") {
    skipWarning(`the session API returned a non-https npm registry URL`);
    return {};
  }

  const target = path.join(runnerTemp, ".npmrc");
  const content = mergeNpmrc(preflight.source.content, {
    registryUrl,
    token: session.token,
    omitLockfileResolved: session.config?.npm?.lockfile_resolved === "omit",
  });
  fs.writeFileSync(target, content, { encoding: "utf8", mode: 0o600 });
  // mode only applies when the file is created; setup-node may have created it.
  fs.chmodSync(target, 0o600);
  core.exportVariable(preflight.source.envKey ?? "NPM_CONFIG_USERCONFIG", target);

  saveState("srRegistryUrl", registryUrl);
  saveState("srNpmrcPath", target);
  // The audit rows for held versions do not say how long the cooldown is, so
  // the post step takes it from here.
  const cooldownDays = session.config?.npm?.cooldown?.days;
  if (typeof cooldownDays === "number" && Number.isInteger(cooldownDays) && cooldownDays >= 0) {
    saveState("srCooldownDays", String(cooldownDays));
  }

  if (preflight.source.content !== "") {
    core.info(`secure-registry: merged existing npm config from ${preflight.source.path}`);
  }
  core.info(`secure-registry: npm installs now go through ${registry.origin}${registry.pathname}`);

  return { registryEndpoint: `${registry.hostname}:${registry.port || "443"}` };
}

// Points npm at secure-registry for the rest of the job. Fails open: any
// problem leaves npm on its default registry and never fails the job.
// job carries the correlation ID and one-time key when /monitor has run;
// the key is sent to the session API only and never logged or saved.
export async function setupSecureRegistry(job: JobBinding = {}): Promise<SecureRegistryResult> {
  const config = secureRegistryInput(core.getInput("secure-registry"));
  if (config === undefined) {
    return {};
  }

  try {
    return await configureNpm(config, job);
  } catch (e) {
    skipWarning(`setup failed: ${e instanceof Error ? e.message : e}`);
    return {};
  }
}
