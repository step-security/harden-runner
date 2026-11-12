import * as core from "@actions/core";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { context } from "@actions/github";
import { SECURE_REGISTRY_AUDIENCE, STEPSECURITY_API_URL } from "./configs";
import {
  buildDeclaredClaims,
  describeSessionFailure,
  missingTokenReason,
  secureRegistryInput,
  sessionWaitsForMonitor,
  setupSecureRegistry,
} from "./secure-registry";

jest.mock("@actions/core", () => ({
  ...jest.requireActual("@actions/core"),
  getIDToken: jest.fn(),
  setSecret: jest.fn(),
  notice: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  startGroup: jest.fn(),
  endGroup: jest.fn(),
  exportVariable: jest.fn(),
}));

jest.mock("@actions/github", () => ({
  context: { eventName: "push", payload: {} },
}));

// os.homedir() reads the real environment, not the test's process.env.
jest.mock("os", () => ({
  ...jest.requireActual("os"),
  homedir: jest.fn(),
}));

const mockedCore = core as jest.Mocked<typeof core>;
const mockedHomedir = os.homedir as jest.MockedFunction<typeof os.homedir>;
const mutableContext = context as { eventName: string; payload: unknown };

const TOKEN = `step_sr_${"a".repeat(48)}_${"b".repeat(32)}`;
const REGISTRY = "https://community.registry.stepsecurity.io/javascript/";
const SESSION_URL = `${STEPSECURITY_API_URL}/secure-registry/sessions`;
const CORRELATION_ID = "0f8b3c2e-5d4a-4e1b-9c7f-2a6d8e0b1c3d";
const ONE_TIME_KEY = "7d2e9a41-c3b5-4f86-a0d1-e5b9c8f7a6d2";

// The runner environment of a public repo on a GitHub-hosted runner.
const JOB_ENV: Record<string, string> = {
  GITHUB_REPOSITORY: "example-org/app",
  GITHUB_REPOSITORY_ID: "1440412103",
  GITHUB_REPOSITORY_OWNER: "example-org",
  GITHUB_REPOSITORY_OWNER_ID: "350558695",
  GITHUB_RUN_ID: "41783901046",
  GITHUB_RUN_ATTEMPT: "1",
  RUNNER_ENVIRONMENT: "github-hosted",
  GITHUB_ACTOR: "octocat",
  GITHUB_ACTOR_ID: "179434735",
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF: "refs/heads/main",
  GITHUB_HEAD_REF: "",
  GITHUB_SHA: "f".repeat(40),
  GITHUB_WORKFLOW_REF: "example-org/app/.github/workflows/ci.yml@refs/heads/main",
  "INPUT_CHECK-RUN-ID": "126421498319",
};
const JOB_PAYLOAD = { repository: { full_name: "example-org/app", visibility: "public", private: false } };
const DECLARED_CLAIMS = {
  repository: "example-org/app",
  repository_id: "1440412103",
  repository_owner: "example-org",
  repository_owner_id: "350558695",
  run_id: "41783901046",
  run_attempt: "1",
  check_run_id: "126421498319",
  repository_visibility: "public",
  runner_environment: "github-hosted",
  actor: "octocat",
  actor_id: "179434735",
  event_name: "push",
  ref: "refs/heads/main",
  sha: "f".repeat(40),
  workflow_ref: "example-org/app/.github/workflows/ci.yml@refs/heads/main",
};

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

let tmp: string;
let home: string;
let runnerTemp: string;
let stateFile: string;
let fetchCalls: Array<{ url: string; body: Record<string, unknown> }>;

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function created(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse(201, {
    token: TOKEN,
    expires_at: 1793300000,
    binding: "oidc",
    edition: "community",
    registries: { npm: REGISTRY },
    config: { npm: { mode: "enforce", cooldown: { days: 2, exemptions: [] }, compromised: true } },
    notices: [],
    ...overrides,
  });
}

// Each fetch call consumes one entry.
function mockFetchSequence(entries: Array<Response | Error>) {
  let i = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    const entry = entries[i++];
    if (!entry) throw new Error("fetch called more times than expected");
    if (entry instanceof Error) throw entry;
    return entry;
  }) as typeof fetch;
}

function readState(): Record<string, string> {
  const state: Record<string, string> = {};
  for (const line of fs.readFileSync(stateFile, "utf8").split(os.EOL)) {
    const eq = line.indexOf("=");
    if (eq > 0) state[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return state;
}

function logged(): string {
  const fns = [
    mockedCore.info,
    mockedCore.notice,
    mockedCore.warning,
    mockedCore.debug,
    mockedCore.startGroup,
  ] as jest.Mock[];
  return fns.flatMap((fn) => fn.mock.calls.map((args) => args.map(String).join(" "))).join("\n");
}

function npmrcPath() {
  return path.join(runnerTemp, ".npmrc");
}

beforeEach(() => {
  jest.clearAllMocks();
  restoreEnv();
  // npm sets npm_config_* for scripts it runs, including this test run.
  for (const key of Object.keys(process.env)) {
    if (key.toLowerCase().startsWith("npm_config_")) delete process.env[key];
  }

  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sr-test-"));
  home = path.join(tmp, "home");
  runnerTemp = path.join(tmp, "runner-temp");
  fs.mkdirSync(home);
  fs.mkdirSync(runnerTemp);
  stateFile = path.join(tmp, "state");
  fs.writeFileSync(stateFile, "");

  mockedHomedir.mockReturnValue(home);
  process.env.RUNNER_TEMP = runnerTemp;
  process.env.GITHUB_STATE = stateFile;
  process.env.GITHUB_SERVER_URL = "https://github.com";
  process.env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://token.example/";
  process.env["INPUT_SECURE-REGISTRY"] = "true";
  // Keeps the preflight from running npm to find the global config.
  process.env.npm_config_globalconfig = path.join(tmp, "no-global-npmrc");
  // Tests may run inside GitHub Actions, which sets these for real.
  for (const key of Object.keys(JOB_ENV)) delete process.env[key];
  Object.assign(process.env, JOB_ENV);

  mutableContext.eventName = "push";
  mutableContext.payload = JOB_PAYLOAD;

  mockedCore.getIDToken.mockResolvedValue("oidc-jwt");
  fetchCalls = [];
});

afterEach(() => {
  restoreEnv();
  globalThis.fetch = ORIGINAL_FETCH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("secureRegistryInput", () => {
  test.each([
    ["", undefined],
    ["  ", undefined],
    ["false", undefined],
    ["FALSE", undefined],
    ["true", "true"],
    ["npm:\n  mode: audit", "npm:\n  mode: audit"],
  ])("%j -> %j", (raw, expected) => {
    expect(secureRegistryInput(raw)).toBe(expected);
  });
});

describe("missingTokenReason", () => {
  const repository = { full_name: "example-org/app" };

  test("fork pull request", () => {
    const payload = { repository, pull_request: { head: { repo: { full_name: "someone/app" } } } };
    expect(missingTokenReason("pull_request", payload)).toBe("fork pull request, no OIDC token available");
  });

  test("pull request from a deleted fork", () => {
    const payload = { repository, pull_request: { head: { repo: null } } };
    expect(missingTokenReason("pull_request", payload)).toBe("fork pull request, no OIDC token available");
  });

  test("same-repo pull request is a missing permission", () => {
    const payload = { repository, pull_request: { head: { repo: { full_name: "example-org/app" } } } };
    expect(missingTokenReason("pull_request", payload)).toContain("id-token: write");
  });

  test("push is a missing permission", () => {
    expect(missingTokenReason("push", { repository })).toContain("id-token: write");
  });
});

describe("describeSessionFailure", () => {
  test.each([
    [403, { code: "not_eligible", reason: "visibility" }, "notice", "public repositories only"],
    [403, { code: "not_eligible", reason: "runner" }, "notice", "GitHub-hosted runners only"],
    [403, { code: "enterprise_not_supported" }, "notice", "StepSecurity subscription"],
    [403, { code: "id_token_required" }, "notice", 'add "permissions: id-token: write" to this job'],
    [400, { code: "bad_request", error: "claims.check_run_id is required" }, "warning", "HTTP 400 (bad_request: claims.check_run_id is required)"],
    [401, { code: "oidc_replayed" }, "warning", "rejected the OIDC token (oidc_replayed)"],
    [401, { code: "oidc_invalid" }, "warning", "rejected the OIDC token (oidc_invalid)"],
    [401, { code: "oidc_expired" }, "warning", "expired again"],
    [503, { code: "unavailable" }, "warning", "unavailable"],
    [500, { code: "internal_error", error: "failed to create session" }, "warning", "HTTP 500 (internal_error: failed to create session)"],
    [502, undefined, "warning", "HTTP 502"],
  ])("%d %j", (status, body, level, message) => {
    const failure = describeSessionFailure({ status, body });
    expect(failure.level).toBe(level);
    expect(failure.message).toContain(message);
  });

  test("rate limit includes Retry-After", () => {
    const failure = describeSessionFailure({ status: 429, body: { code: "rate_limited" }, retryAfter: "120" });
    expect(failure).toEqual({ level: "warning", message: "session rate limit reached, retry after 120s" });
  });
});

describe("buildDeclaredClaims", () => {
  const build = (env: Record<string, string | undefined> = {}, payload: unknown = JOB_PAYLOAD, checkRunId = "126421498319") =>
    buildDeclaredClaims({ ...JOB_ENV, ...env }, payload as Parameters<typeof buildDeclaredClaims>[1], checkRunId);

  test("builds every claim from the runner environment", () => {
    expect(build()).toEqual({ ok: true, claims: DECLARED_CLAIMS });
  });

  test("keeps head_ref on pull requests", () => {
    const result = build({ GITHUB_EVENT_NAME: "pull_request", GITHUB_HEAD_REF: "feature" });
    expect(result.ok && result.claims).toMatchObject({ event_name: "pull_request", head_ref: "feature" });
  });

  test.each([
    [{ visibility: "public", private: false }, "public"],
    [{ visibility: "internal", private: true }, "internal"],
    [{ private: false }, "public"],
    [{ private: true }, "private"],
  ])("visibility from the event payload %j", (repository, expected) => {
    const result = build({}, { repository });
    expect(result.ok && result.claims.repository_visibility).toBe(expected);
  });

  test.each([
    ["check_run_id", {}, "", "check_run_id is missing"],
    ["repository_id", { GITHUB_REPOSITORY_ID: undefined }, "126421498319", "repository_id is missing"],
    ["runner_environment", { RUNNER_ENVIRONMENT: "" }, "126421498319", "runner_environment is missing"],
    ["run_id", { GITHUB_RUN_ID: "41783901046x" }, "126421498319", "run_id is malformed"],
    ["check_run_id", {}, "12e4", "check_run_id is malformed"],
    ["repository", { GITHUB_REPOSITORY: "a".repeat(513) }, "126421498319", "repository is malformed"],
    ["repository", { GITHUB_REPOSITORY: "example-org/app/extra" }, "126421498319", "repository is malformed"],
    ["repository", { GITHUB_REPOSITORY: "example-org/a#b" }, "126421498319", "repository is malformed"],
    ["repository_owner", { GITHUB_REPOSITORY_OWNER: "someone-else" }, "126421498319", "repository_owner does not match repository"],
  ])("rejects a bad %s", (_name, env, checkRunId, reason) => {
    expect(build(env, JOB_PAYLOAD, checkRunId)).toEqual({ ok: false, reason });
  });

  test("rejects a payload without repository visibility", () => {
    expect(build({}, {})).toEqual({ ok: false, reason: "repository_visibility is missing" });
  });

  test("matches the owner ignoring case", () => {
    expect(build({ GITHUB_REPOSITORY_OWNER: "Example-Org" }).ok).toBe(true);
  });

  test("leaves out optional claims that are empty or malformed", () => {
    const result = build({ GITHUB_ACTOR_ID: "not-a-number", GITHUB_SHA: "", GITHUB_ACTOR: undefined });
    expect(result.ok).toBe(true);
    const claims = result.ok ? result.claims : {};
    expect(claims).not.toHaveProperty("actor_id");
    expect(claims).not.toHaveProperty("sha");
    expect(claims).not.toHaveProperty("actor");
    expect(claims).not.toHaveProperty("head_ref");
  });
});

describe("sessionWaitsForMonitor", () => {
  const hosted = { arc: false, githubHosted: true, customVMImage: false, agentInstalled: false };

  test.each([
    ["GitHub-hosted runner", hosted, true],
    ["ARC runner", { ...hosted, arc: true, githubHosted: false }, false],
    ["self-hosted runner", { ...hosted, githubHosted: false }, false],
    ["custom VM image with Harden-Runner", { ...hosted, customVMImage: true }, false],
    ["agent already installed", { ...hosted, agentInstalled: true }, false],
  ])("%s", (_name, runner, expected) => {
    expect(sessionWaitsForMonitor(runner)).toBe(expected);
  });
});

describe("setupSecureRegistry", () => {
  test.each(["", "false"])("does nothing when the input is %j", async (input) => {
    process.env["INPUT_SECURE-REGISTRY"] = input;
    mockFetchSequence([]);
    expect(await setupSecureRegistry()).toEqual({});
    expect(mockedCore.getIDToken).not.toHaveBeenCalled();
    expect(fetchCalls).toHaveLength(0);
    expect(logged()).toBe("");
  });

  test("configures npm from a new session", async () => {
    mockFetchSequence([created({ notices: [{ source: "workflow", path: "pypi", code: "unsupported_ecosystem", message: "pypi is not supported yet" }] })]);

    const result = await setupSecureRegistry();

    expect(result).toEqual({ registryEndpoint: "community.registry.stepsecurity.io:443" });
    expect(mockedCore.getIDToken).toHaveBeenCalledWith(SECURE_REGISTRY_AUDIENCE);
    expect(fetchCalls).toEqual([{ url: SESSION_URL, body: { oidc_token: "oidc-jwt", config: "true" } }]);

    expect(mockedCore.setSecret).toHaveBeenCalledWith(TOKEN);
    expect(mockedCore.setSecret.mock.invocationCallOrder[0]).toBeLessThan(
      mockedCore.startGroup.mock.invocationCallOrder[0]
    );
    expect(logged()).not.toContain(TOKEN);

    expect(fs.readFileSync(npmrcPath(), "utf8")).toBe(
      `registry=${REGISTRY}\n//community.registry.stepsecurity.io/javascript/:_authToken=${TOKEN}\n` +
        "//community.registry.stepsecurity.io/javascript/:always-auth=true\n"
    );
    if (process.platform !== "win32") {
      expect(fs.statSync(npmrcPath()).mode & 0o777).toBe(0o600);
    }
    expect(mockedCore.exportVariable).toHaveBeenCalledWith("NPM_CONFIG_USERCONFIG", npmrcPath());

    expect(readState()).toEqual({
      srToken: TOKEN,
      srBinding: "oidc",
      srRegistryUrl: REGISTRY,
      srNpmrcPath: npmrcPath(),
      srCooldownDays: "2",
    });
    expect(mockedCore.notice).toHaveBeenCalledWith("secure-registry: pypi is not supported yet (pypi)");
    expect(mockedCore.warning).not.toHaveBeenCalled();
  });

  test("merges the user's ~/.npmrc", async () => {
    fs.writeFileSync(
      path.join(home, ".npmrc"),
      "@example-org:registry=https://npm.pkg.github.com/\n//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n"
    );
    mockFetchSequence([created()]);

    await setupSecureRegistry();

    expect(fs.readFileSync(npmrcPath(), "utf8")).toBe(
      [
        "@example-org:registry=https://npm.pkg.github.com/",
        "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}",
        `registry=${REGISTRY}`,
        `//community.registry.stepsecurity.io/javascript/:_authToken=${TOKEN}`,
        "//community.registry.stepsecurity.io/javascript/:always-auth=true",
      ].join("\n") + "\n"
    );
    // The user's own file is left untouched.
    expect(fs.readFileSync(path.join(home, ".npmrc"), "utf8")).not.toContain(TOKEN);
  });

  test("reads setup-node's file before overwriting the same path", async () => {
    fs.writeFileSync(
      npmrcPath(),
      "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\nregistry=https://registry.npmjs.org/\nalways-auth=false\n",
      { mode: 0o644 }
    );
    process.env.NPM_CONFIG_USERCONFIG = npmrcPath();
    mockFetchSequence([created()]);

    await setupSecureRegistry();

    expect(fs.readFileSync(npmrcPath(), "utf8")).toBe(
      [
        "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}",
        "always-auth=false",
        `registry=${REGISTRY}`,
        `//community.registry.stepsecurity.io/javascript/:_authToken=${TOKEN}`,
        "//community.registry.stepsecurity.io/javascript/:always-auth=true",
      ].join("\n") + "\n"
    );
    if (process.platform !== "win32") {
      expect(fs.statSync(npmrcPath()).mode & 0o777).toBe(0o600);
    }
  });

  test("exports the same variable name the user config came from", async () => {
    const custom = path.join(tmp, "custom-npmrc");
    fs.writeFileSync(custom, "save-exact=true\n");
    process.env.npm_config_userconfig = custom;
    mockFetchSequence([created()]);

    await setupSecureRegistry();

    expect(mockedCore.exportVariable).toHaveBeenCalledWith("npm_config_userconfig", npmrcPath());
    expect(fs.readFileSync(npmrcPath(), "utf8").startsWith("save-exact=true\n")).toBe(true);
  });

  test("expands ~ in the user config path, as npm does", async () => {
    fs.mkdirSync(path.join(tmp, "home"), { recursive: true });
    mockedHomedir.mockReturnValue(path.join(tmp, "home"));
    fs.writeFileSync(path.join(tmp, "home", "my-npmrc"), "registry=https://mirror.example/\n");
    process.env.NPM_CONFIG_USERCONFIG = "~/my-npmrc";
    mockFetchSequence([]);

    expect(await setupSecureRegistry()).toEqual({});
    expect(fetchCalls).toHaveLength(0);
  });

  test("opts in to omit-lockfile-registry-resolved", async () => {
    mockFetchSequence([created({ config: { npm: { mode: "enforce", lockfile_resolved: "omit" } } })]);

    await setupSecureRegistry();

    expect(fs.readFileSync(npmrcPath(), "utf8")).toContain("\nomit-lockfile-registry-resolved=true\n");
  });

  test("saves npm's cooldown days for the post step", async () => {
    mockFetchSequence([created({ config: { npm: { mode: "enforce", cooldown: { days: 0, exemptions: [] } } } })]);
    await setupSecureRegistry();
    expect(readState().srCooldownDays).toBe("0");
  });

  test("no cooldown state when the config has no usable cooldown", async () => {
    for (const cooldown of [undefined, {}, { days: "2" }, { days: -1 }]) {
      fs.writeFileSync(stateFile, "");
      mockFetchSequence([created({ config: { npm: { mode: "enforce", cooldown } } })]);
      await setupSecureRegistry();
      expect(readState()).toHaveProperty("srRegistryUrl", REGISTRY);
      expect(readState()).not.toHaveProperty("srCooldownDays");
    }
  });

  describe("does not switch a registry the user chose", () => {
    test("NPM_CONFIG_REGISTRY is set", async () => {
      process.env.NPM_CONFIG_REGISTRY = "https://user:secret@mirror.example.com/npm/";
      mockFetchSequence([]);

      expect(await setupSecureRegistry()).toEqual({});
      expect(mockedCore.notice).toHaveBeenCalledWith(
        "secure-registry: NPM_CONFIG_REGISTRY is set (mirror.example.com). npm stays on the default registry."
      );
      expect(logged()).not.toContain("secret");
      expect(mockedCore.getIDToken).not.toHaveBeenCalled();
    });

    test("~/.npmrc points at a mirror", async () => {
      fs.writeFileSync(path.join(home, ".npmrc"), "registry=https://artifactory.example.com/api/npm/npm/\n");
      mockFetchSequence([]);

      expect(await setupSecureRegistry()).toEqual({});
      expect(mockedCore.notice.mock.calls[0][0]).toContain("sets registry to artifactory.example.com");
      expect(fs.existsSync(npmrcPath())).toBe(false);
      expect(mockedCore.getIDToken).not.toHaveBeenCalled();
    });

    test("the global npm config points at a mirror", async () => {
      fs.writeFileSync(process.env.npm_config_globalconfig, "registry=https://nexus.example.com/repository/npm/\n");
      mockFetchSequence([]);

      expect(await setupSecureRegistry()).toEqual({});
      expect(mockedCore.notice.mock.calls[0][0]).toContain("the global npm config");
      expect(mockedCore.getIDToken).not.toHaveBeenCalled();
    });
  });

  test("a global mirror does not matter when the user config sets the public registry", async () => {
    fs.writeFileSync(process.env.npm_config_globalconfig, "registry=https://nexus.example.com/repository/npm/\n");
    fs.writeFileSync(path.join(home, ".npmrc"), "registry=https://registry.npmjs.org/\n");
    mockFetchSequence([created()]);

    expect(await setupSecureRegistry()).toEqual({ registryEndpoint: "community.registry.stepsecurity.io:443" });
    expect(mockedCore.notice).not.toHaveBeenCalled();
  });

  test("sends the correlation ID but not the key with an OIDC token", async () => {
    mockFetchSequence([created()]);

    await setupSecureRegistry({ correlationId: CORRELATION_ID, oneTimeKey: ONE_TIME_KEY });

    expect(fetchCalls[0].body).toEqual({ oidc_token: "oidc-jwt", correlation_id: CORRELATION_ID, config: "true" });
  });

  describe("no OIDC token: declared claims", () => {
    beforeEach(() => {
      delete process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    });

    test("binds the session to the job's one-time key", async () => {
      mockFetchSequence([created({ binding: "hr_key" })]);

      const result = await setupSecureRegistry({ correlationId: CORRELATION_ID, oneTimeKey: ONE_TIME_KEY });

      expect(result).toEqual({ registryEndpoint: "community.registry.stepsecurity.io:443" });
      expect(mockedCore.getIDToken).not.toHaveBeenCalled();
      expect(fetchCalls).toEqual([
        {
          url: SESSION_URL,
          body: { claims: DECLARED_CLAIMS, correlation_id: CORRELATION_ID, one_time_key: ONE_TIME_KEY, config: "true" },
        },
      ]);
      expect(mockedCore.debug).toHaveBeenCalledWith(
        'secure-registry: no id-token: write permission, using declared claims; add "permissions: id-token: write" for verified attribution'
      );
      expect(mockedCore.notice).not.toHaveBeenCalled();
      expect(mockedCore.warning).not.toHaveBeenCalled();
      expect(readState()).toMatchObject({ srToken: TOKEN, srBinding: "hr_key" });
      expect(mockedCore.info).toHaveBeenCalledWith("binding: hr_key");
    });

    test("never logs or saves the one-time key", async () => {
      mockFetchSequence([created({ binding: "hr_key" })]);

      await setupSecureRegistry({ correlationId: CORRELATION_ID, oneTimeKey: ONE_TIME_KEY });

      expect(logged()).not.toContain(ONE_TIME_KEY);
      expect(fs.readFileSync(stateFile, "utf8")).not.toContain(ONE_TIME_KEY);
      expect(fs.readFileSync(npmrcPath(), "utf8")).not.toContain(ONE_TIME_KEY);
      expect(mockedCore.exportVariable.mock.calls.flat().join(" ")).not.toContain(ONE_TIME_KEY);
    });

    test("an unbound session gets a notice that it is not in run insights", async () => {
      mockFetchSequence([created({ binding: "none" })]);

      expect(await setupSecureRegistry({ correlationId: CORRELATION_ID, oneTimeKey: ONE_TIME_KEY })).toEqual({
        registryEndpoint: "community.registry.stepsecurity.io:443",
      });
      expect(mockedCore.notice).toHaveBeenCalledTimes(1);
      expect(mockedCore.notice.mock.calls[0][0]).toBe(
        'secure-registry: this job is not linked to run insights, so the packages it installs will not appear there. Add "permissions: id-token: write" to this job to link it.'
      );
      expect(readState()).toMatchObject({ srBinding: "none" });
      expect(fs.existsSync(npmrcPath())).toBe(true);
    });

    test("without /monitor (container and ubuntu-slim jobs) sends no correlation ID or key", async () => {
      mockFetchSequence([created({ binding: "none" })]);

      await setupSecureRegistry();

      expect(fetchCalls[0].body).toEqual({ claims: DECLARED_CLAIMS, config: "true" });
    });

    test("without a one-time key (/monitor failed) sends the correlation ID only", async () => {
      mockFetchSequence([created({ binding: "none" })]);

      await setupSecureRegistry({ correlationId: CORRELATION_ID, oneTimeKey: "" });

      expect(fetchCalls[0].body).toEqual({ claims: DECLARED_CLAIMS, correlation_id: CORRELATION_ID, config: "true" });
    });

    test("a correlation ID that is not a UUID is sent with neither the ID nor the key", async () => {
      mockFetchSequence([created({ binding: "none" })]);

      await setupSecureRegistry({ correlationId: "runner-name-1", oneTimeKey: ONE_TIME_KEY });

      expect(fetchCalls[0].body).toEqual({ claims: DECLARED_CLAIMS, config: "true" });
    });

    test("fork pull request runs now get a session", async () => {
      mutableContext.eventName = "pull_request";
      mutableContext.payload = {
        ...JOB_PAYLOAD,
        pull_request: { head: { repo: { full_name: "someone/app" } } },
      };
      mockFetchSequence([created({ binding: "hr_key" })]);

      expect(await setupSecureRegistry({ correlationId: CORRELATION_ID, oneTimeKey: ONE_TIME_KEY })).toEqual({
        registryEndpoint: "community.registry.stepsecurity.io:443",
      });
      expect(mockedCore.debug.mock.calls.flat().join("\n")).toContain(
        "secure-registry: fork pull request, no OIDC token available, using declared claims"
      );
    });

    test("skips with a notice when the job identity is incomplete", async () => {
      delete process.env["INPUT_CHECK-RUN-ID"];
      mockFetchSequence([]);

      expect(await setupSecureRegistry({ correlationId: CORRELATION_ID, oneTimeKey: ONE_TIME_KEY })).toEqual({});
      expect(fetchCalls).toHaveLength(0);
      expect(mockedCore.notice).toHaveBeenCalledWith(
        "secure-registry: no id-token: write permission, and the job identity is incomplete (check_run_id is missing). npm stays on the default registry."
      );
    });

    test("does not retry on oidc_expired", async () => {
      mockFetchSequence([jsonResponse(401, { code: "oidc_expired", error: "expired" })]);

      expect(await setupSecureRegistry({ correlationId: CORRELATION_ID, oneTimeKey: ONE_TIME_KEY })).toEqual({});
      expect(fetchCalls).toHaveLength(1);
    });

    test("an enterprise owner is told to add id-token: write", async () => {
      mockFetchSequence([jsonResponse(403, { code: "id_token_required", error: "x" })]);

      expect(await setupSecureRegistry({ correlationId: CORRELATION_ID, oneTimeKey: ONE_TIME_KEY })).toEqual({});
      expect(mockedCore.notice).toHaveBeenCalledWith(
        'secure-registry: organizations with a StepSecurity subscription need a verified job identity, add "permissions: id-token: write" to this job. npm stays on the default registry.'
      );
      expect(readState()).toEqual({});
    });
  });

  test("retries once with a new OIDC token when the first one expired", async () => {
    mockedCore.getIDToken.mockResolvedValueOnce("jwt-1").mockResolvedValueOnce("jwt-2");
    mockFetchSequence([jsonResponse(401, { code: "oidc_expired", error: "expired" }), created()]);

    expect(await setupSecureRegistry()).toEqual({ registryEndpoint: "community.registry.stepsecurity.io:443" });
    expect(fetchCalls.map((c) => c.body.oidc_token)).toEqual(["jwt-1", "jwt-2"]);
  });

  test("gives up after the second expired token", async () => {
    mockFetchSequence([
      jsonResponse(401, { code: "oidc_expired", error: "expired" }),
      jsonResponse(401, { code: "oidc_expired", error: "expired" }),
    ]);

    expect(await setupSecureRegistry()).toEqual({});
    expect(fetchCalls).toHaveLength(2);
    expect(mockedCore.warning.mock.calls[0][0]).toContain("expired again");
  });

  test.each([
    ["not eligible", jsonResponse(403, { code: "not_eligible", error: "x", reason: "visibility" }), "notice"],
    ["enterprise", jsonResponse(403, { code: "enterprise_not_supported", error: "x" }), "notice"],
    ["rate limited", jsonResponse(429, { code: "rate_limited", error: "x" }, { "retry-after": "120" }), "warning"],
    ["unavailable", jsonResponse(503, { code: "unavailable", error: "x" }), "warning"],
    ["internal error", jsonResponse(500, { code: "internal_error", error: "x" }), "warning"],
    ["non-JSON error", new Response("<html>bad gateway</html>", { status: 502 }), "warning"],
  ])("fails open: %s", async (_name, response, level) => {
    mockFetchSequence([response as Response]);

    expect(await setupSecureRegistry()).toEqual({});
    const annotate = level === "notice" ? mockedCore.notice : mockedCore.warning;
    expect(annotate).toHaveBeenCalledTimes(1);
    expect(annotate.mock.calls[0][0]).toMatch(/npm stays on the default registry\.$/);
    expect(fs.existsSync(npmrcPath())).toBe(false);
    expect(mockedCore.exportVariable).not.toHaveBeenCalled();
    expect(readState()).toEqual({});
  });

  test("fails open when the session API is unreachable", async () => {
    mockFetchSequence([new TypeError("fetch failed")]);

    expect(await setupSecureRegistry()).toEqual({});
    expect(mockedCore.warning).toHaveBeenCalledWith(
      "secure-registry: setup failed: fetch failed. npm stays on the default registry."
    );
  });

  test("falls back to declared claims when the OIDC token cannot be fetched", async () => {
    mockedCore.getIDToken.mockRejectedValue(new Error("Failed to get ID Token"));
    mockFetchSequence([created({ binding: "hr_key" })]);

    expect(await setupSecureRegistry({ correlationId: CORRELATION_ID, oneTimeKey: ONE_TIME_KEY })).toEqual({
      registryEndpoint: "community.registry.stepsecurity.io:443",
    });
    expect(fetchCalls[0].body).toEqual({
      claims: DECLARED_CLAIMS,
      correlation_id: CORRELATION_ID,
      one_time_key: ONE_TIME_KEY,
      config: "true",
    });
    expect(mockedCore.debug.mock.calls.flat().join("\n")).toContain(
      "the OIDC token could not be fetched (Failed to get ID Token), using declared claims"
    );
    expect(mockedCore.warning).not.toHaveBeenCalled();
  });

  test("fails open when a fresh OIDC token cannot be fetched for the retry", async () => {
    mockedCore.getIDToken.mockResolvedValueOnce("jwt-1").mockRejectedValueOnce(new Error("Failed to get ID Token"));
    mockFetchSequence([jsonResponse(401, { code: "oidc_expired", error: "expired" })]);

    expect(await setupSecureRegistry()).toEqual({});
    expect(mockedCore.warning.mock.calls[0][0]).toContain("Failed to get ID Token");
  });

  test("200 without a token when npm is off", async () => {
    mockFetchSequence([
      jsonResponse(200, { edition: "community", registries: {}, config: { npm: { mode: "off" } }, notices: [] }),
    ]);

    expect(await setupSecureRegistry()).toEqual({});
    expect(mockedCore.info).toHaveBeenCalledWith("secure-registry: npm is off, nothing to configure");
    expect(mockedCore.warning).not.toHaveBeenCalled();
    expect(fs.existsSync(npmrcPath())).toBe(false);
    expect(readState()).toEqual({});
  });

  test("200 without a token when ecosystems leaves out npm", async () => {
    mockFetchSequence([jsonResponse(200, { edition: "community", registries: {}, config: {}, notices: [] })]);

    expect(await setupSecureRegistry()).toEqual({});
    expect(mockedCore.info).toHaveBeenCalledWith(
      "secure-registry: npm is not listed in ecosystems, nothing to configure"
    );
    expect(mockedCore.warning).not.toHaveBeenCalled();
    expect(fs.existsSync(npmrcPath())).toBe(false);
    expect(readState()).toEqual({});
  });

  test("201 without a token is a warning", async () => {
    mockFetchSequence([jsonResponse(201, { edition: "community", registries: { npm: REGISTRY } })]);

    expect(await setupSecureRegistry()).toEqual({});
    expect(mockedCore.warning.mock.calls[0][0]).toContain("returned no token");
  });

  test("keeps the token for revoke when the registry URL is not https", async () => {
    mockFetchSequence([created({ registries: { npm: "http://community.registry.stepsecurity.io/javascript/" } })]);

    expect(await setupSecureRegistry()).toEqual({});
    expect(mockedCore.warning.mock.calls[0][0]).toContain("non-https");
    expect(fs.existsSync(npmrcPath())).toBe(false);
    expect(readState()).toEqual({ srToken: TOKEN, srBinding: "oidc" });
  });

  test("a token for other ecosystems only leaves npm alone", async () => {
    mockFetchSequence([
      created({
        registries: { pypi: "https://community.registry.stepsecurity.io/python/" },
        config: { pypi: { mode: "enforce" } },
      }),
    ]);

    expect(await setupSecureRegistry()).toEqual({});
    expect(mockedCore.info).toHaveBeenCalledWith(
      "secure-registry: npm is not listed in ecosystems, nothing to configure"
    );
    expect(fs.existsSync(npmrcPath())).toBe(false);
    expect(readState()).toEqual({ srToken: TOKEN, srBinding: "oidc" });
  });

  test("ignores ecosystems other than npm", async () => {
    mockFetchSequence([created({ registries: { npm: REGISTRY, pypi: "https://community.registry.stepsecurity.io/python/" } })]);

    expect(await setupSecureRegistry()).toEqual({ registryEndpoint: "community.registry.stepsecurity.io:443" });
    expect(mockedCore.info).toHaveBeenCalledWith(
      "secure-registry: this version of Harden-Runner configures npm only, ignoring pypi"
    );
  });

  test("skips GitHub Enterprise Server", async () => {
    process.env.GITHUB_SERVER_URL = "https://ghes.example.com";
    mockFetchSequence([]);

    expect(await setupSecureRegistry()).toEqual({});
    expect(mockedCore.notice.mock.calls[0][0]).toContain("GitHub Enterprise Server");
    expect(mockedCore.getIDToken).not.toHaveBeenCalled();
  });

  test("skips when RUNNER_TEMP is not set", async () => {
    delete process.env.RUNNER_TEMP;
    mockFetchSequence([]);

    expect(await setupSecureRegistry()).toEqual({});
    expect(mockedCore.notice.mock.calls[0][0]).toContain("RUNNER_TEMP is not set");
  });

  test("fails open when something throws after the session is created", async () => {
    process.env.GITHUB_STATE = path.join(tmp, "missing-dir", "state");
    mockFetchSequence([created()]);

    expect(await setupSecureRegistry()).toEqual({});
    expect(mockedCore.warning.mock.calls[0][0]).toMatch(/^secure-registry: setup failed: .*npm stays on the default registry\.$/);
    expect(logged()).not.toContain(TOKEN);
  });
});
