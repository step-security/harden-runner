import * as core from "@actions/core";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { STEPSECURITY_API_URL, STEPSECURITY_WEB_URL } from "./configs";
import {
  RunSummary,
  changedFiles,
  compareVersions,
  cooldownTiming,
  fetchSummary,
  finishSecureRegistry,
  insightsPackagesUrl,
  leakedLockfiles,
  readPostState,
  registryOverride,
  renderSummary,
  revokeToken,
  suggestedExemptions,
} from "./secure-registry-post";

jest.mock("@actions/core", () => ({
  ...jest.requireActual("@actions/core"),
  setSecret: jest.fn(),
  notice: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const mockedCore = core as jest.Mocked<typeof core>;

const TOKEN = `step_sr_${"a".repeat(48)}_${"b".repeat(32)}`;
const HOST = "community.registry.stepsecurity.io";
const REGISTRY = `https://${HOST}/javascript/`;
const SUMMARY_URL = `${STEPSECURITY_API_URL}/secure-registry/sessions/summary`;
const REVOKE_URL = `${STEPSECURITY_API_URL}/secure-registry/sessions/revoke`;

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

let tmp: string;
let fetchCalls: Array<{ url: string; method: string; auth: string | null }>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

// Each fetch call consumes one entry.
function mockFetchSequence(entries: Array<Response | Error>) {
  let i = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    fetchCalls.push({ url: String(input), method: init?.method ?? "GET", auth: headers.get("authorization") });
    const entry = entries[i++];
    if (!entry) throw new Error("fetch called more times than expected");
    if (entry instanceof Error) throw entry;
    return entry;
  }) as typeof fetch;
}

function logged(): string {
  const fns = [mockedCore.info, mockedCore.notice, mockedCore.warning, mockedCore.debug] as jest.Mock[];
  return fns.flatMap((fn) => fn.mock.calls.map((args) => args.map(String).join(" "))).join("\n");
}

const EMPTY = { held: [], blocked: [], may_be_incomplete: true };

const COOLDOWN_REASON = "left-pad@1.3.1 was published 14h0m0s ago, which is within the 2-day cooldown period";

const SUMMARY: RunSummary = {
  held: [
    {
      ecosystem: "javascript",
      package: "typescript",
      versions: ["7.1.0-dev.20261030.1", "7.1.0-dev.20261029.1", "7.0.2"],
      controls: [{ name: "cooldown", reason: "3 version(s) filtered by cooldown period" }],
    },
  ],
  blocked: [
    {
      ecosystem: "javascript",
      package: "left-pad",
      version: "1.3.1",
      controls: [{ name: "cooldown", reason: COOLDOWN_REASON }],
    },
    {
      ecosystem: "javascript",
      package: "debug",
      version: "4.3.4",
      controls: [{ name: "compromised", reason: "debug@4.3.4 is a known compromised version" }],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  restoreEnv();
  for (const key of Object.keys(process.env)) {
    if (key.toLowerCase().startsWith("npm_config_")) delete process.env[key];
  }
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sr-post-test-"));
  fetchCalls = [];
});

afterEach(() => {
  restoreEnv();
  globalThis.fetch = ORIGINAL_FETCH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("readPostState", () => {
  test("nothing configured", () => {
    expect(readPostState({})).toBeUndefined();
    expect(readPostState({ STATE_srToken: "" })).toBeUndefined();
  });

  test("token without a registry", () => {
    expect(readPostState({ STATE_srToken: TOKEN })).toEqual({ token: TOKEN, registryUrl: undefined });
  });

  test("binding", () => {
    expect(readPostState({ STATE_srToken: TOKEN, STATE_srBinding: "none" })?.binding).toBe("none");
    expect(readPostState({ STATE_srToken: TOKEN, STATE_srBinding: "" })?.binding).toBeUndefined();
  });

  test("token and registry", () => {
    expect(readPostState({ STATE_srToken: TOKEN, STATE_srRegistryUrl: REGISTRY })).toEqual({
      token: TOKEN,
      registryUrl: REGISTRY,
    });
  });

  test("cooldown days", () => {
    const days = (v?: string) => readPostState({ STATE_srToken: TOKEN, STATE_srCooldownDays: v })?.cooldownDays;
    expect(days("2")).toBe(2);
    expect(days("0")).toBe(0);
    for (const v of [undefined, "", "abc", "-1", "1.5"]) expect(days(v)).toBeUndefined();
  });

  test("correlation ID", () => {
    expect(readPostState({ STATE_srToken: TOKEN, STATE_correlation_id: "abc" })?.correlationId).toBe("abc");
    expect(readPostState({ STATE_srToken: TOKEN })?.correlationId).toBeUndefined();
  });
});

describe("registryOverride", () => {
  function npmrc(content: string): string {
    const file = path.join(tmp, ".npmrc");
    fs.writeFileSync(file, content);
    return file;
  }

  test("still on our registry", () => {
    const file = npmrc(`registry=${REGISTRY}\n//${HOST}/javascript/:_authToken=${TOKEN}\n`);
    expect(registryOverride({ NPM_CONFIG_USERCONFIG: file }, REGISTRY)).toBeUndefined();
  });

  test("trailing slash difference is the same registry", () => {
    const file = npmrc(`registry=https://${HOST}/javascript\n`);
    expect(registryOverride({ NPM_CONFIG_USERCONFIG: file }, REGISTRY)).toBeUndefined();
  });

  test("lowercase env var is honored", () => {
    const file = npmrc(`registry=${REGISTRY}\n`);
    expect(registryOverride({ npm_config_userconfig: file }, REGISTRY)).toBeUndefined();
  });

  test("setup-node replaced our registry line", () => {
    const file = npmrc(
      `//${HOST}/javascript/:_authToken=${TOKEN}\n//registry.npmjs.org/:_authToken=\${NODE_AUTH_TOKEN}\nregistry=https://registry.npmjs.org/\n`
    );
    expect(registryOverride({ NPM_CONFIG_USERCONFIG: file }, REGISTRY)).toBe(
      `${file} now sets registry to registry.npmjs.org`
    );
  });

  test("registry line removed", () => {
    const file = npmrc("save-exact=true\n");
    expect(registryOverride({ NPM_CONFIG_USERCONFIG: file }, REGISTRY)).toBe(`${file} no longer sets a registry`);
  });

  test("NPM_CONFIG_REGISTRY set later", () => {
    const file = npmrc(`registry=${REGISTRY}\n`);
    expect(
      registryOverride({ NPM_CONFIG_USERCONFIG: file, NPM_CONFIG_REGISTRY: "https://user:pw@mirror.example/" }, REGISTRY)
    ).toBe("NPM_CONFIG_REGISTRY is set to mirror.example");
  });

  test("user config unset", () => {
    expect(registryOverride({}, REGISTRY)).toBe("NPM_CONFIG_USERCONFIG is no longer set");
  });

  test("user config file deleted", () => {
    const file = path.join(tmp, "gone");
    expect(registryOverride({ NPM_CONFIG_USERCONFIG: file }, REGISTRY)).toBe(`${file} no longer exists`);
  });
});

describe("lockfiles", () => {
  function run(args: string[], cwd: string) {
    cp.execFileSync("git", args, { cwd, stdio: "ignore" });
  }

  let repo: string;
  let sha: string;

  beforeEach(() => {
    repo = path.join(tmp, "repo");
    fs.mkdirSync(path.join(repo, "pkg"), { recursive: true });
    run(["init", "-q"], repo);
    run(["config", "user.email", "test@example.com"], repo);
    run(["config", "user.name", "test"], repo);
    run(["config", "commit.gpgsign", "false"], repo);
    fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n");
    fs.writeFileSync(path.join(repo, "package-lock.json"), '{"resolved": "https://registry.npmjs.org/a/-/a-1.0.0.tgz"}');
    fs.writeFileSync(path.join(repo, "pkg", "package-lock.json"), "{}");
    run(["add", "."], repo);
    run(["commit", "-q", "-m", "init"], repo);
    sha = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  });

  const leaked = `{"resolved": "https://${HOST}/javascript/a/-/a-1.0.0.tgz"}`;

  test("finds modified, untracked and committed lockfiles that use our host", () => {
    fs.writeFileSync(path.join(repo, "package-lock.json"), leaked);
    fs.mkdirSync(path.join(repo, "new"));
    fs.writeFileSync(path.join(repo, "new", "npm-shrinkwrap.json"), leaked);
    // Ignored, and npm's hidden lockfile is never committed.
    fs.mkdirSync(path.join(repo, "node_modules"));
    fs.writeFileSync(path.join(repo, "node_modules", ".package-lock.json"), leaked);

    fs.writeFileSync(path.join(repo, "pkg", "package-lock.json"), leaked);
    run(["commit", "-q", "-am", "update deps"], repo);
    fs.writeFileSync(path.join(repo, "package-lock.json"), leaked);

    const files = changedFiles(repo, sha);
    expect(leakedLockfiles(repo, files, HOST)).toEqual([
      "new/npm-shrinkwrap.json",
      "package-lock.json",
      "pkg/package-lock.json",
    ]);
  });

  test("ignores changed lockfiles on other hosts", () => {
    fs.writeFileSync(path.join(repo, "package-lock.json"), '{"resolved": "https://registry.npmjs.org/b/-/b-1.0.0.tgz"}');
    expect(leakedLockfiles(repo, changedFiles(repo, sha), HOST)).toEqual([]);
  });

  test("ignores unchanged lockfiles", () => {
    expect(leakedLockfiles(repo, changedFiles(repo, sha), HOST)).toEqual([]);
  });

  test("a SHA that is not in the repo still checks the working tree", () => {
    fs.writeFileSync(path.join(repo, "package-lock.json"), leaked);
    expect(leakedLockfiles(repo, changedFiles(repo, "0".repeat(40)), HOST)).toEqual(["package-lock.json"]);
  });

  test("not a git repository throws", () => {
    expect(() => changedFiles(tmp)).toThrow();
  });
});

describe("cooldownTiming", () => {
  test.each([
    [COOLDOWN_REASON, { age: "14h", clearsIn: "34h" }],
    ["x@1.0.0 was published 18h10m0s ago, which is within the 2-day cooldown period", { age: "18h10m", clearsIn: "29h50m" }],
    ["x@1.0.0 was published 45m0s ago, which is within the 1-day cooldown period", { age: "45m", clearsIn: "23h15m" }],
    ["x@1.0.0 was published 0s ago, which is within the cooldown period", { age: "0m" }],
    ["3 version(s) filtered by cooldown period", undefined],
    ["x@1.0.0 was published recently ago", undefined],
  ])("%j", (reason, expected) => {
    expect(cooldownTiming(reason)).toEqual(expected);
  });
});

describe("compareVersions", () => {
  test("sorts by semver precedence", () => {
    const versions = ["1.0.0", "1.0.0-alpha.1", "1.0.0-alpha", "1.0.0-beta", "0.9.12", "1.0.0-alpha.beta", "1.0.0-rc.1", "1.10.0", "1.2.0"];
    expect([...versions].sort(compareVersions)).toEqual([
      "0.9.12",
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-rc.1",
      "1.0.0",
      "1.2.0",
      "1.10.0",
    ]);
  });
});

describe("suggestedExemptions", () => {
  test("one version per package, cooldown only", () => {
    expect(suggestedExemptions(SUMMARY)).toEqual(
      new Map([["npm", ["left-pad@1.3.1", "typescript@7.1.0-dev.20261030.1"]]])
    );
  });

  test("blocked versions come first, each part sorted", () => {
    const summary: RunSummary = {
      held: [
        { ecosystem: "javascript", package: "b-held", versions: ["1.0.0"], controls: [{ name: "cooldown" }] },
        { ecosystem: "javascript", package: "a-held", versions: ["1.0.0"], controls: [{ name: "cooldown" }] },
      ],
      blocked: [
        { ecosystem: "javascript", package: "z-blocked", version: "1.0.0", controls: [{ name: "cooldown" }] },
        { ecosystem: "javascript", package: "y-blocked", version: "1.0.0", controls: [{ name: "cooldown" }] },
      ],
    };
    expect(suggestedExemptions(summary)).toEqual(
      new Map([["npm", ["y-blocked@1.0.0", "z-blocked@1.0.0", "a-held@1.0.0", "b-held@1.0.0"]]])
    );
  });

  test("a blocked version wins over the newest hidden one", () => {
    const summary: RunSummary = {
      held: [{ ecosystem: "javascript", package: "left-pad", versions: ["1.3.2", "1.3.1"], controls: [{ name: "cooldown" }] }],
      blocked: [{ ecosystem: "javascript", package: "left-pad", version: "1.3.1", controls: [{ name: "cooldown" }] }],
    };
    expect(suggestedExemptions(summary)).toEqual(new Map([["npm", ["left-pad@1.3.1"]]]));
  });

  test("nothing for compromised, mixed controls or unknown ecosystems", () => {
    const summary: RunSummary = {
      held: [{ ecosystem: "python", package: "requests", versions: ["9.0.0"], controls: [{ name: "cooldown" }] }],
      blocked: [
        { ecosystem: "javascript", package: "a", version: "1.0.0", controls: [{ name: "cooldown" }, { name: "compromised" }] },
        { ecosystem: "javascript", package: "b", version: "1.0.0", controls: [] },
      ],
    };
    expect(suggestedExemptions(summary).size).toBe(0);
  });
});

describe("renderSummary", () => {
  test("nothing held or blocked", () => {
    expect(renderSummary({ held: [], blocked: [] })).toBeUndefined();
  });

  test("held, blocked and the exemption snippet", () => {
    const md = renderSummary(SUMMARY)!;
    expect(md).toContain("| `typescript` | `7.1.0-dev.20261030.1`, `7.1.0-dev.20261029.1`, `7.0.2` | 3 version(s) filtered by cooldown period |");
    expect(md).toContain("| `left-pad@1.3.1` | cooldown | published 14h ago, clears in 34h |");
    expect(md).toContain("| `debug@4.3.4` | compromised | debug@4.3.4 is a known compromised version |");
    expect(md).toContain(
      [
        "```yaml",
        "secure-registry: |",
        "  npm:",
        "    cooldown:",
        "      exemptions:",
        '        - "left-pad@1.3.1"',
        '        - "typescript@7.1.0-dev.20261030.1"',
        "```",
      ].join("\n")
    );
    expect(md).toContain("compromised cannot be exempted");
  });

  test("no snippet when nothing can be exempted", () => {
    const md = renderSummary({ held: [], blocked: [SUMMARY.blocked[1]] })!;
    expect(md).not.toContain("```yaml");
  });

  test("unlinked session with nothing held or blocked", () => {
    expect(renderSummary(EMPTY, { binding: "none" })).toBe(
      [
        "### Secure registry",
        "",
        "This job is not linked to run insights, so the packages it installs will not appear there. Add `permissions: id-token: write` to this job to link it.",
        "",
      ].join("\n")
    );
  });

  test("linked or unknown binding with nothing held or blocked", () => {
    for (const binding of ["oidc", "hr_key", "", undefined]) {
      expect(renderSummary(EMPTY, { binding })).toBeUndefined();
    }
  });

  test("unlinked line follows the tables", () => {
    const md = renderSummary(SUMMARY, { binding: "none" })!;
    expect(md).toContain("left-pad@1.3.1");
    expect(md.trimEnd().endsWith("Add `permissions: id-token: write` to this job to link it.")).toBe(true);
    expect(md.indexOf("may be missing from this list")).toBeLessThan(md.indexOf("not linked to run insights"));
  });

  test("no unlinked line for linked sessions", () => {
    for (const binding of ["oidc", "hr_key", undefined]) {
      expect(renderSummary(SUMMARY, { binding })).not.toContain("not linked to run insights");
    }
  });

  test("blocked comes before held, each sorted by package", () => {
    const md = renderSummary({
      held: [
        { ecosystem: "javascript", package: "zod", versions: ["4.0.0"], controls: [{ name: "cooldown" }] },
        { ecosystem: "javascript", package: "chalk", versions: ["6.0.0"], controls: [{ name: "cooldown" }] },
      ],
      blocked: [
        { ecosystem: "javascript", package: "ms", version: "2.1.4", controls: [{ name: "cooldown" }] },
        { ecosystem: "javascript", package: "debug", version: "4.3.5", controls: [{ name: "cooldown" }] },
        { ecosystem: "javascript", package: "debug", version: "4.3.4", controls: [{ name: "compromised" }] },
      ],
    })!;
    const order = ["**Blocked.**", "`debug@4.3.4`", "`debug@4.3.5`", "`ms@2.1.4`", "**Held.**", "`chalk`", "`zod`"].map((s) =>
      md.indexOf(s)
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(md.startsWith("### Secure registry\n")).toBe(true);
  });

  describe("cooldown window", () => {
    test("held intro and rerun line say how long the cooldown is", () => {
      const md = renderSummary(SUMMARY, { cooldownDays: 2 })!;
      expect(md).toContain(
        '**Held.** These versions were hidden from npm, so it used an older version or failed with ETARGET ("No matching version found"). The cooldown for this job is 2 days.'
      );
      expect(md).toContain("You can also rerun the job once the 2-day cooldown has passed.");
    });

    test("one day", () => {
      expect(renderSummary(SUMMARY, { cooldownDays: 1 })).toContain("The cooldown for this job is 1 day.");
    });

    test("unknown or off: today's wording", () => {
      for (const cooldownDays of [undefined, 0]) {
        const md = renderSummary(SUMMARY, { cooldownDays })!;
        expect(md).not.toContain("The cooldown for this job is");
        expect(md).toContain("You can also rerun the job once the cooldown has passed.");
      }
    });

    test("no window in the held intro when cooldown held nothing", () => {
      const md = renderSummary(
        {
          held: [{ ecosystem: "javascript", package: "debug", versions: ["4.3.4"], controls: [{ name: "compromised" }] }],
          blocked: [],
        },
        { cooldownDays: 2 }
      )!;
      expect(md).toContain("**Held.**");
      expect(md).not.toContain("The cooldown for this job is");
    });
  });

  describe("would be blocked (audit mode)", () => {
    const wouldBlock = [
      { ecosystem: "javascript", package: "minimatch", version: "", controls: [{ name: "custom_block_list", reason: "'minimatch' matches a configured block list pattern" }] },
      { ecosystem: "javascript", package: "left-pad", version: "1.3.1", controls: [{ name: "cooldown", reason: COOLDOWN_REASON }] },
    ];

    test("listed on their own, after blocked and held", () => {
      const md = renderSummary({ ...SUMMARY, wouldBlock })!;
      expect(md).toContain("**Would be blocked.** This job runs secure-registry in audit mode, so these downloads were allowed.");
      expect(md).toContain("| `left-pad@1.3.1` | cooldown | published 14h ago, clears in 34h |");
      expect(md).toContain("| `minimatch` | custom_block_list | 'minimatch' matches a configured block list pattern |");
      expect(md.indexOf("**Held.**")).toBeLessThan(md.indexOf("**Would be blocked.**"));
      expect(md.indexOf("`left-pad@1.3.1` | cooldown | published", md.indexOf("**Would be blocked.**"))).toBeLessThan(
        md.indexOf("`minimatch`")
      );
    });

    test("rendered when nothing else is", () => {
      const md = renderSummary({ held: [], blocked: [], wouldBlock })!;
      expect(md).toContain("**Would be blocked.**");
      expect(md).not.toContain("**Blocked.**");
      expect(md).not.toContain("**Held.**");
    });

    test("not offered as exemptions", () => {
      const md = renderSummary({ held: [], blocked: [], wouldBlock })!;
      expect(md).not.toContain("```yaml");
    });
  });

  describe("long lists", () => {
    const INSIGHTS = "https://app.example/github/o/r/actions/runs/1?tab=packages";
    const blocked = Array.from({ length: 12 }, (_, i) => ({
      ecosystem: "javascript",
      package: `p${String(i).padStart(2, "0")}`,
      version: "1.0.0",
      controls: [{ name: "cooldown" }],
    }));
    const versions = Array.from({ length: 8 }, (_, i) => `1.0.${i}`);
    const held = [
      { ecosystem: "javascript", package: "many", versions, controls: [{ name: "block_list", reason: "a|b" }] },
      ...Array.from({ length: 6 }, (_, i) => ({ ecosystem: "javascript", package: `h${i}`, versions: ["2.0.0"], controls: [{ name: "cooldown" }] })),
    ];

    test("each table shows 5 rows and links to run insights", () => {
      const md = renderSummary({ held, blocked }, { insightsUrl: INSIGHTS })!;
      expect(md).toContain("`p04@1.0.0`");
      expect(md).not.toContain("`p05@1.0.0`");
      expect(md).toContain(`Showing 5 of 12. [See all packages for this job in run insights](${INSIGHTS}).`);
      expect(md).toContain(`Showing 5 of 7. [See all packages for this job in run insights](${INSIGHTS}).`);
      expect(md).not.toContain("and 7 more |");
    });

    test("the exemption snippet shows 5 entries, blocked first, and links to run insights", () => {
      const md = renderSummary({ held, blocked }, { insightsUrl: INSIGHTS })!;
      for (let i = 0; i < 5; i++) expect(md).toContain(`- "p0${i}@1.0.0"`);
      expect(md).not.toContain(`- "p05@1.0.0"`);
      expect(md).not.toContain(`- "h0@2.0.0"`);
      expect(md).toContain(
        `\`\`\`\n\nShowing 5 of 18 exemptions. [See all packages for this job in run insights](${INSIGHTS}).`
      );
    });

    test("held versions fill the snippet after blocked ones", () => {
      const md = renderSummary({ held, blocked: blocked.slice(0, 3) })!;
      expect(md).toContain(['        - "p02@1.0.0"', '        - "h0@2.0.0"', '        - "h1@2.0.0"', "```"].join("\n"));
      expect(md).toContain("Showing 5 of 9 exemptions.\n");
    });

    test("no exemptions line when the snippet is not cut", () => {
      const md = renderSummary({ held: [], blocked: blocked.slice(0, 5) }, { insightsUrl: INSIGHTS })!;
      expect(md).toContain('- "p04@1.0.0"');
      expect(md).not.toContain("exemptions.");
    });

    test("no link without an insights URL", () => {
      const md = renderSummary({ held: [], blocked }, { binding: "none" })!;
      expect(md).toContain("Showing 5 of 12.\n");
      expect(md).not.toContain("See all packages");
    });

    test("no showing line when nothing is cut", () => {
      const md = renderSummary({ held: [], blocked: blocked.slice(0, 5) }, { insightsUrl: INSIGHTS })!;
      expect(md).not.toContain("Showing");
    });

    test("hidden versions per package are still cut at 5, and cells are escaped", () => {
      const md = renderSummary({ held: held.slice(0, 1), blocked: [] })!;
      expect(md).toContain("`1.0.7`, `1.0.6`, `1.0.5`, `1.0.4`, `1.0.3` and 3 more");
      expect(md).toContain("a\\|b");
    });
  });
});

describe("insightsPackagesUrl", () => {
  const env = { GITHUB_REPOSITORY: "octo/repo", GITHUB_RUN_ID: "42" };
  const CORRELATION = "e7e37f5c-910f-4b17-963b-5c03dbd397ff";

  test("bound session", () => {
    for (const binding of ["oidc", "hr_key"]) {
      expect(insightsPackagesUrl(env, { token: TOKEN, binding, correlationId: CORRELATION }, "130298415397")).toBe(
        `${STEPSECURITY_WEB_URL}/github/octo/repo/actions/runs/42?tab=packages&correlationId=${CORRELATION}&utm_source=markdown&jobId=130298415397`
      );
    }
  });

  test("nothing when the job's rows are not in insights or the page cannot be addressed", () => {
    const state = { token: TOKEN, binding: "oidc", correlationId: CORRELATION };
    expect(insightsPackagesUrl(env, { ...state, binding: "none" }, "1")).toBeUndefined();
    expect(insightsPackagesUrl(env, { ...state, binding: undefined }, "1")).toBeUndefined();
    expect(insightsPackagesUrl(env, { ...state, correlationId: undefined }, "1")).toBeUndefined();
    expect(insightsPackagesUrl(env, state, "")).toBeUndefined();
    expect(insightsPackagesUrl(env, state, "${{ job.check_run_id }}")).toBeUndefined();
    expect(insightsPackagesUrl({ GITHUB_RUN_ID: "42" }, state, "1")).toBeUndefined();
    expect(insightsPackagesUrl({ GITHUB_REPOSITORY: "octo/repo" }, state, "1")).toBeUndefined();
  });
});

describe("fetchSummary", () => {
  const noSleep = jest.fn(async () => undefined);

  test("returns a non-empty first answer without retrying", async () => {
    mockFetchSequence([jsonResponse(200, { ...SUMMARY, may_be_incomplete: true })]);
    expect(await fetchSummary(TOKEN, noSleep)).toEqual({ ...SUMMARY, wouldBlock: [] });
    expect(fetchCalls).toEqual([{ url: SUMMARY_URL, method: "GET", auth: `Bearer ${TOKEN}` }]);
    expect(noSleep).not.toHaveBeenCalled();
  });

  test("asks once more when the first answer is empty", async () => {
    mockFetchSequence([jsonResponse(200, EMPTY), jsonResponse(200, SUMMARY)]);
    expect(await fetchSummary(TOKEN, noSleep)).toEqual({ ...SUMMARY, wouldBlock: [] });
    expect(fetchCalls).toHaveLength(2);
    expect(noSleep).toHaveBeenCalledTimes(1);
  });

  test("keeps the empty answer if the retry fails", async () => {
    mockFetchSequence([jsonResponse(200, EMPTY), jsonResponse(500, { code: "internal_error" })]);
    expect(await fetchSummary(TOKEN, noSleep)).toEqual({ held: [], blocked: [], wouldBlock: [] });
  });

  test("an error status gives no summary", async () => {
    mockFetchSequence([jsonResponse(401, { code: "token_inactive" })]);
    expect(await fetchSummary(TOKEN, noSleep)).toBeUndefined();
    expect(logged()).toContain("could not read the run summary (HTTP 401)");
  });
});

describe("revokeToken", () => {
  test("204", async () => {
    mockFetchSequence([noContent()]);
    await revokeToken(TOKEN);
    expect(fetchCalls).toEqual([{ url: REVOKE_URL, method: "POST", auth: `Bearer ${TOKEN}` }]);
    expect(logged()).toContain("run token revoked");
  });

  test("error status is logged, not thrown", async () => {
    mockFetchSequence([jsonResponse(404, { code: "token_not_found" })]);
    await revokeToken(TOKEN);
    expect(logged()).toContain("could not revoke the run token (HTTP 404, token_not_found)");
    expect(mockedCore.warning).not.toHaveBeenCalled();
  });

  test("network error is logged, not thrown", async () => {
    mockFetchSequence([new Error("connect ECONNREFUSED")]);
    await revokeToken(TOKEN);
    expect(logged()).toContain("could not revoke the run token (connect ECONNREFUSED)");
  });
});

describe("finishSecureRegistry", () => {
  let summaryFile: string;
  let npmrcFile: string;

  beforeEach(() => {
    summaryFile = path.join(tmp, "step-summary.md");
    fs.writeFileSync(summaryFile, "");
    npmrcFile = path.join(tmp, ".npmrc");
    fs.writeFileSync(npmrcFile, `registry=${REGISTRY}\n`);
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    // core.summary keeps the first path it resolved; each test has its own.
    (core.summary as unknown as { _filePath?: string })._filePath = undefined;
    core.summary.emptyBuffer();
    process.env.NPM_CONFIG_USERCONFIG = npmrcFile;
    process.env.STATE_srToken = TOKEN;
    process.env.STATE_srRegistryUrl = REGISTRY;
    // Not a git repository, so the lockfile check skips quietly.
    process.env.GITHUB_WORKSPACE = tmp;
  });

  test("does nothing when the pre step configured nothing", async () => {
    delete process.env.STATE_srToken;
    mockFetchSequence([]);
    await finishSecureRegistry();
    expect(fetchCalls).toHaveLength(0);
    expect(logged()).toBe("");
  });

  test("writes the job summary, then revokes", async () => {
    mockFetchSequence([jsonResponse(200, SUMMARY), noContent()]);
    await finishSecureRegistry();

    expect(fetchCalls.map((c) => c.url)).toEqual([SUMMARY_URL, REVOKE_URL]);
    expect(fs.readFileSync(summaryFile, "utf8")).toContain("left-pad@1.3.1");
    expect(mockedCore.setSecret).toHaveBeenCalledWith(TOKEN);
    expect(mockedCore.notice).not.toHaveBeenCalled();
    expect(mockedCore.warning).not.toHaveBeenCalled();
    expect(logged()).not.toContain(TOKEN);
  });

  test("cooldown window, would-block rows and the insights link from state, input and API", async () => {
    const CORRELATION = "e7e37f5c-910f-4b17-963b-5c03dbd397ff";
    process.env.STATE_srCooldownDays = "2";
    process.env.STATE_srBinding = "oidc";
    process.env.STATE_correlation_id = CORRELATION;
    process.env["INPUT_CHECK-RUN-ID"] = "130298415397";
    process.env.GITHUB_REPOSITORY = "octo/repo";
    process.env.GITHUB_RUN_ID = "42";
    const blocked = Array.from({ length: 6 }, (_, i) => ({
      ecosystem: "javascript",
      package: `p${i}`,
      version: "1.0.0",
      controls: [{ name: "cooldown", reason: COOLDOWN_REASON }],
    }));
    const wouldBlock = [{ ecosystem: "javascript", package: "minimatch", version: "10.2.6", controls: [{ name: "custom_block_list" }] }];
    mockFetchSequence([
      jsonResponse(200, { held: SUMMARY.held, blocked, would_block: wouldBlock, may_be_incomplete: true }),
      noContent(),
    ]);
    await finishSecureRegistry();

    const written = fs.readFileSync(summaryFile, "utf8");
    expect(written).toContain("The cooldown for this job is 2 days.");
    expect(written).toContain("`minimatch@10.2.6`");
    expect(written).toContain(
      `Showing 5 of 6. [See all packages for this job in run insights](${STEPSECURITY_WEB_URL}/github/octo/repo/actions/runs/42?tab=packages&correlationId=${CORRELATION}&utm_source=markdown&jobId=130298415397).`
    );
    expect(logged()).toContain("1 package(s) held, 6 version(s) blocked, 1 would be blocked in enforce mode, see the job summary");
  });

  test("only revokes when npm was not configured", async () => {
    delete process.env.STATE_srRegistryUrl;
    mockFetchSequence([noContent()]);
    await finishSecureRegistry();
    expect(fetchCalls.map((c) => c.url)).toEqual([REVOKE_URL]);
  });

  test("still revokes when the summary call throws", async () => {
    mockFetchSequence([new Error("socket hang up"), noContent()]);
    await finishSecureRegistry();
    expect(fetchCalls.map((c) => c.url)).toEqual([SUMMARY_URL, REVOKE_URL]);
    expect(logged()).toContain("could not read the run summary: socket hang up");
    expect(fs.readFileSync(summaryFile, "utf8")).toBe("");
  });

  describe("binding", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    // An empty first answer is asked again after a delay; skip the wait.
    async function finishWithEmptySummary() {
      jest.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
        fn();
        return 0;
      }) as unknown as typeof setTimeout);
      mockFetchSequence([jsonResponse(200, EMPTY), jsonResponse(200, EMPTY), noContent()]);
      await finishSecureRegistry();
      expect(fetchCalls.map((c) => c.url)).toEqual([SUMMARY_URL, SUMMARY_URL, REVOKE_URL]);
    }

    test("unlinked line when nothing was held or blocked", async () => {
      process.env.STATE_srBinding = "none";
      await finishWithEmptySummary();
      const written = fs.readFileSync(summaryFile, "utf8");
      expect(written).toContain("### Secure registry");
      expect(written).toContain("This job is not linked to run insights");
      expect(logged()).toContain("no package versions were held or blocked");
    });

    test("nothing written for a linked session with nothing held or blocked", async () => {
      process.env.STATE_srBinding = "hr_key";
      await finishWithEmptySummary();
      expect(fs.readFileSync(summaryFile, "utf8")).toBe("");
    });

    test("unlinked line with the tables", async () => {
      process.env.STATE_srBinding = "none";
      mockFetchSequence([jsonResponse(200, SUMMARY), noContent()]);
      await finishSecureRegistry();
      const written = fs.readFileSync(summaryFile, "utf8");
      expect(written).toContain("left-pad@1.3.1");
      expect(written).toContain("This job is not linked to run insights");
    });

    test("unlinked line when the summary cannot be read", async () => {
      process.env.STATE_srBinding = "none";
      mockFetchSequence([jsonResponse(500, {}), noContent()]);
      await finishSecureRegistry();
      expect(fetchCalls.map((c) => c.url)).toEqual([SUMMARY_URL, REVOKE_URL]);
      expect(fs.readFileSync(summaryFile, "utf8")).toContain("This job is not linked to run insights");
      expect(logged()).not.toContain("no package versions were held or blocked");
    });

    test("no line when npm was not configured", async () => {
      process.env.STATE_srBinding = "none";
      delete process.env.STATE_srRegistryUrl;
      mockFetchSequence([noContent()]);
      await finishSecureRegistry();
      expect(fetchCalls.map((c) => c.url)).toEqual([REVOKE_URL]);
      expect(fs.readFileSync(summaryFile, "utf8")).toBe("");
    });
  });

  test("notice when setup-node replaced our registry", async () => {
    fs.writeFileSync(npmrcFile, "registry=https://registry.npmjs.org/\n");
    mockFetchSequence([jsonResponse(200, SUMMARY), noContent()]);
    await finishSecureRegistry();
    expect(mockedCore.notice).toHaveBeenCalledWith(
      expect.stringContaining(`npm stopped using secure-registry during this job (${npmrcFile} now sets registry to registry.npmjs.org)`)
    );
  });

  test("warning when a changed lockfile uses our host", async () => {
    const repo = path.join(tmp, "repo");
    fs.mkdirSync(repo);
    cp.execFileSync("git", ["init", "-q"], { cwd: repo });
    fs.writeFileSync(path.join(repo, "package-lock.json"), `{"resolved": "${REGISTRY}a/-/a-1.0.0.tgz"}`);
    process.env.GITHUB_WORKSPACE = repo;

    mockFetchSequence([jsonResponse(200, SUMMARY), noContent()]);
    await finishSecureRegistry();
    expect(mockedCore.warning).toHaveBeenCalledWith(
      expect.stringContaining(`package-lock.json now has package URLs on ${HOST}`),
      { file: "package-lock.json" }
    );
  });
});
