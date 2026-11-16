import * as core from "@actions/core";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { STEPSECURITY_API_URL } from "./configs";
import { describeRegistry, findEnv, unscopedRegistry } from "./npmrc";

const SUMMARY_TIMEOUT_MS = 5000;
const REVOKE_TIMEOUT_MS = 5000;
// Recent requests can take a moment to appear in the summary, so an empty
// first answer is asked again once after this delay.
const SUMMARY_RETRY_DELAY_MS = 3000;

const LOCKFILE_NAMES = ["package-lock.json", "npm-shrinkwrap.json"];

export interface PostState {
  token: string;
  registryUrl?: string;
}

// What the summary API returns for this job. The lists are only counted
// here: the API renders the job summary section itself, so its wording can
// change without a new release of this action.
export interface RunSummary {
  held: unknown[];
  blocked: unknown[];
  wouldBlock: unknown[];
  markdown: string;
}

// Returns what the pre step left for this step, or undefined when it
// configured nothing.
export function readPostState(env: NodeJS.ProcessEnv): PostState | undefined {
  const token = env.STATE_srToken;
  if (!token) {
    return undefined;
  }
  return { token, registryUrl: env.STATE_srRegistryUrl || undefined };
}

function sameRegistry(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return (
      x.origin === y.origin &&
      x.pathname.replace(/\/+$/, "") === y.pathname.replace(/\/+$/, "")
    );
  } catch {
    return false;
  }
}

// Describes how npm's registry moved away from ours after the pre step, or
// returns undefined when npm still uses it. actions/setup-node with
// registry-url replaces our registry= line in the same file.
export function registryOverride(
  env: NodeJS.ProcessEnv,
  registryUrl: string
): string | undefined {
  const envRegistry = findEnv(env, "npm_config_registry");
  if (envRegistry) {
    return `${envRegistry.key} is set to ${describeRegistry(envRegistry.value)}`;
  }
  const userConfig = findEnv(env, "npm_config_userconfig");
  if (!userConfig) {
    return "NPM_CONFIG_USERCONFIG is no longer set";
  }
  if (!fs.existsSync(userConfig.value)) {
    return `${userConfig.value} no longer exists`;
  }
  const registry = unscopedRegistry(fs.readFileSync(userConfig.value, "utf8"));
  if (registry === undefined) {
    return `${userConfig.value} no longer sets a registry`;
  }
  if (!sameRegistry(registry, registryUrl)) {
    return `${userConfig.value} now sets registry to ${describeRegistry(registry)}`;
  }
  return undefined;
}

// In container jobs the workspace belongs to another user, and
// actions/checkout removes its safe.directory entry in its own post step,
// which runs before this one. The workspace is trusted here, but settings
// that run commands (fsmonitor, external diff) stay off.
function git(cwd: string, args: string[]): string[] {
  const safe = ["-c", `safe.directory=${cwd}`, "-c", "core.fsmonitor=false"];
  const out = cp.execFileSync("git", [...safe, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 10000,
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 10 * 1024 * 1024,
  });
  return out.split("\0").filter((f) => f !== "");
}

// Lists files the job changed: edited, staged or new, plus anything in
// commits made since the checkout, since a job that commits its lockfile
// leaves a clean tree behind.
export function changedFiles(workspace: string, sha?: string): string[] {
  const files = new Set<string>();
  const add = (args: string[]) => {
    for (const f of git(workspace, args)) files.add(f);
  };
  add(["ls-files", "-z", "--modified", "--others", "--exclude-standard"]);
  add(["diff", "-z", "--no-ext-diff", "--name-only", "--cached"]);
  if (sha) {
    try {
      add(["diff", "-z", "--no-ext-diff", "--name-only", sha, "HEAD"]);
    } catch (e) {
      core.debug(`secure-registry: unable to diff against ${sha}: ${e}`);
    }
  }
  return [...files];
}

// Returns the changed npm lockfiles that record package URLs on our host.
// Those fail with E401 anywhere the run token is not configured.
export function leakedLockfiles(
  workspace: string,
  files: string[],
  registryHost: string
): string[] {
  const needle = `//${registryHost}/`;
  return files
    .filter((f) => LOCKFILE_NAMES.includes(path.basename(f)))
    .filter((f) => !f.split(/[\\/]/).includes("node_modules"))
    .filter((f) => {
      const full = path.join(workspace, f);
      try {
        return fs.statSync(full).isFile() && fs.readFileSync(full, "utf8").includes(needle);
      } catch {
        return false;
      }
    })
    .sort();
}

function checkLockfiles(registryUrl: string) {
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) {
    return;
  }
  let host: string;
  try {
    host = new URL(registryUrl).host;
  } catch {
    return;
  }
  let files: string[];
  try {
    files = changedFiles(workspace, process.env.GITHUB_SHA);
  } catch (e) {
    // No checkout, or git refuses the workspace (owner mismatch in containers).
    core.debug(`secure-registry: skipping the lockfile check: ${e}`);
    return;
  }
  for (const file of leakedLockfiles(workspace, files, host)) {
    core.warning(
      `secure-registry: ${file} now has package URLs on ${host}. ` +
        `Do not commit it from this job as is: installs that do not use this run's ` +
        `registry token fail with E401. To keep lockfiles portable, add ` +
        `"lockfile-resolved: omit" under npm in the secure-registry input.`,
      { file }
    );
  }
}

async function getSummary(token: string): Promise<RunSummary | undefined> {
  const resp = await fetch(`${STEPSECURITY_API_URL}/secure-registry/sessions/summary`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
  });
  if (resp.status !== 200) {
    core.info(`secure-registry: could not read the run summary (HTTP ${resp.status})`);
    return undefined;
  }
  const body = (await resp.json()) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    held: list(body.held),
    blocked: list(body.blocked),
    wouldBlock: list(body.would_block),
    markdown: typeof body.markdown === "string" ? body.markdown : "",
  };
}

function isEmpty(summary: RunSummary): boolean {
  return summary.held.length === 0 && summary.blocked.length === 0 && summary.wouldBlock.length === 0;
}

export async function fetchSummary(
  token: string,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<RunSummary | undefined> {
  const first = await getSummary(token);
  if (!first || !isEmpty(first)) {
    return first;
  }
  await sleep(SUMMARY_RETRY_DELAY_MS);
  try {
    return (await getSummary(token)) ?? first;
  } catch (e) {
    // The first answer may still carry markdown worth writing.
    core.info(`secure-registry: could not read the run summary again: ${e instanceof Error ? e.message : e}`);
    return first;
  }
}

export async function revokeToken(token: string): Promise<void> {
  try {
    const resp = await fetch(`${STEPSECURITY_API_URL}/secure-registry/sessions/revoke`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
    });
    if (resp.status === 204) {
      core.info("secure-registry: run token revoked");
      return;
    }
    let code = "";
    try {
      code = ((await resp.json()) as { code?: string })?.code ?? "";
    } catch {
      // Not JSON; the status is enough.
    }
    core.info(
      `secure-registry: could not revoke the run token (HTTP ${resp.status}${code ? `, ${code}` : ""}); it expires on its own`
    );
  } catch (e) {
    core.info(
      `secure-registry: could not revoke the run token (${e instanceof Error ? e.message : e}); it expires on its own`
    );
  }
}

async function reportRun(state: PostState & { registryUrl: string }) {
  const override = registryOverride(process.env, state.registryUrl);
  if (override) {
    core.notice(
      `secure-registry: npm stopped using secure-registry during this job (${override}), ` +
        `so installs after that change were not checked. actions/setup-node with ` +
        `registry-url: https://registry.npmjs.org after Harden-Runner does this.`
    );
  }

  checkLockfiles(state.registryUrl);

  let summary: RunSummary | undefined;
  try {
    summary = await fetchSummary(state.token);
  } catch (e) {
    core.info(`secure-registry: could not read the run summary: ${e instanceof Error ? e.message : e}`);
  }
  if (!summary) {
    return;
  }
  const wouldBlock = summary.wouldBlock.length ? `, ${summary.wouldBlock.length} would be blocked in enforce mode` : "";
  core.info(
    isEmpty(summary)
      ? "secure-registry: no package versions were held or blocked"
      : `secure-registry: ${summary.held.length} package(s) held, ${summary.blocked.length} version(s) blocked${wouldBlock}, see the job summary`
  );
  if (summary.markdown) {
    await core.summary.addRaw(summary.markdown, true).write();
  }
}

// Reports what secure-registry did in this job, then revokes the run token.
// Skips quietly when the pre step configured nothing, and never fails the
// job.
export async function finishSecureRegistry(): Promise<void> {
  const state = readPostState(process.env);
  if (!state) {
    return;
  }
  // Masks registered in the pre step cover the job, but this is cheap.
  core.setSecret(state.token);

  try {
    if (state.registryUrl) {
      await reportRun({ ...state, registryUrl: state.registryUrl });
    }
  } catch (e) {
    core.info(`secure-registry: post-step report failed: ${e instanceof Error ? e.message : e}`);
  } finally {
    // After the summary: revoking first would make the summary call fail.
    await revokeToken(state.token);
  }
}
