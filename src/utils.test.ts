import { shouldDeployAgentOnSelfHosted, isAgentInstalled, isPlatformSupported, getAnnotationLogs, detectThirdPartyRunnerProvider, getPrivilegeMode, redactSignedUrls } from "./utils";
import * as fs from "fs";
import * as os from "os";

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: jest.fn(),
}));

jest.mock("os", () => ({
  ...jest.requireActual("os"),
  userInfo: jest.fn(),
}));

const mockedExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockedUserInfo = os.userInfo as jest.MockedFunction<typeof os.userInfo>;

describe("shouldDeployAgentOnSelfHosted", () => {
  test("returns true when deploy flag is true, not container, agent not installed", () => {
    expect(shouldDeployAgentOnSelfHosted(true, false, false)).toBe(true);
  });

  test("returns false when deploy flag is false", () => {
    expect(shouldDeployAgentOnSelfHosted(false, false, false)).toBe(false);
  });

  test("returns false when running in a container", () => {
    expect(shouldDeployAgentOnSelfHosted(true, true, false)).toBe(false);
  });

  test("returns false when agent is already installed", () => {
    expect(shouldDeployAgentOnSelfHosted(true, false, true)).toBe(false);
  });

  test("returns false when in container and agent installed", () => {
    expect(shouldDeployAgentOnSelfHosted(true, true, true)).toBe(false);
  });

  test("returns false when all conditions are negative", () => {
    expect(shouldDeployAgentOnSelfHosted(false, true, true)).toBe(false);
  });
});

describe("isAgentInstalled", () => {
  afterEach(() => {
    mockedExistsSync.mockReset();
  });

  test("returns false for linux when status file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);
    expect(isAgentInstalled("linux")).toBe(false);
    expect(mockedExistsSync).toHaveBeenCalledWith("/home/agent/agent.status");
  });

  test("returns true for linux when status file exists", () => {
    mockedExistsSync.mockReturnValue(true);
    expect(isAgentInstalled("linux")).toBe(true);
  });

  test("returns false for win32 when status file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);
    expect(isAgentInstalled("win32")).toBe(false);
    expect(mockedExistsSync).toHaveBeenCalledWith("C:\\agent\\agent.status");
  });

  test("returns false for darwin when status file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);
    expect(isAgentInstalled("darwin")).toBe(false);
    expect(mockedExistsSync).toHaveBeenCalledWith("/opt/step-security/agent.status");
  });

  test("returns false for unsupported platform", () => {
    expect(isAgentInstalled("freebsd" as NodeJS.Platform)).toBe(false);
  });
});

describe("isPlatformSupported", () => {
  test("returns true for linux", () => {
    expect(isPlatformSupported("linux")).toBe(true);
  });

  test("returns true for win32", () => {
    expect(isPlatformSupported("win32")).toBe(true);
  });

  test("returns true for darwin", () => {
    expect(isPlatformSupported("darwin")).toBe(true);
  });

  test("returns false for unsupported platform", () => {
    expect(isPlatformSupported("freebsd" as NodeJS.Platform)).toBe(false);
  });
});

describe("getAnnotationLogs", () => {
  test("throws for unsupported platform", () => {
    expect(() => getAnnotationLogs("freebsd" as NodeJS.Platform)).toThrow("platform not supported");
  });
});

describe("getPrivilegeMode", () => {
  afterEach(() => {
    mockedUserInfo.mockReset();
  });

  test("returns root when uid is 0", () => {
    mockedUserInfo.mockReturnValue({ uid: 0 } as os.UserInfo<string>);
    expect(getPrivilegeMode()).toBe("root");
  });

  test("returns sudo when uid is non-zero", () => {
    mockedUserInfo.mockReturnValue({ uid: 1000 } as os.UserInfo<string>);
    expect(getPrivilegeMode()).toBe("sudo");
  });

  test("returns sudo when userInfo throws", () => {
    mockedUserInfo.mockImplementation(() => {
      throw new Error("no user info");
    });
    expect(getPrivilegeMode()).toBe("sudo");
  });
});

describe("detectThirdPartyRunnerProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEPOT_RUNNER;
    delete process.env.NAMESPACE_GITHUB_RUNTIME;
    delete process.env.BITRISE_IO;
    delete process.env.CODEBUILD_RUNNER_TYPE;
    delete process.env.RUNNER_NAME;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("returns depot when DEPOT_RUNNER=1", () => {
    process.env.DEPOT_RUNNER = "1";
    expect(detectThirdPartyRunnerProvider()).toBe("depot");
  });

  test("returns null when DEPOT_RUNNER=0", () => {
    process.env.DEPOT_RUNNER = "0";
    expect(detectThirdPartyRunnerProvider()).toBeNull();
  });

  test("returns namespace when NAMESPACE_GITHUB_RUNTIME is set", () => {
    process.env.NAMESPACE_GITHUB_RUNTIME = "something";
    expect(detectThirdPartyRunnerProvider()).toBe("namespace");
  });

  test("returns bitrise when BITRISE_IO is set", () => {
    process.env.BITRISE_IO = "true";
    expect(detectThirdPartyRunnerProvider()).toBe("bitrise");
  });

  test("returns codebuild when CODEBUILD_RUNNER_TYPE=GITHUB", () => {
    process.env.CODEBUILD_RUNNER_TYPE = "GITHUB";
    expect(detectThirdPartyRunnerProvider()).toBe("codebuild");
  });

  test("returns null when CODEBUILD_RUNNER_TYPE has a non-GITHUB value", () => {
    process.env.CODEBUILD_RUNNER_TYPE = "OTHER";
    expect(detectThirdPartyRunnerProvider()).toBeNull();
  });

  test("returns warp for RUNNER_NAME prefix warp-", () => {
    process.env.RUNNER_NAME = "warp-4x-x64-abc";
    expect(detectThirdPartyRunnerProvider()).toBe("warp");
  });

  test("returns blacksmith for RUNNER_NAME prefix blacksmith-", () => {
    process.env.RUNNER_NAME = "blacksmith-01kpj-4vcpu";
    expect(detectThirdPartyRunnerProvider()).toBe("blacksmith");
  });

  test("returns avrea for RUNNER_NAME prefix avrea-exe-", () => {
    process.env.RUNNER_NAME = "avrea-exe-01kpj";
    expect(detectThirdPartyRunnerProvider()).toBe("avrea");
  });

  test("returns null when no env vars match", () => {
    expect(detectThirdPartyRunnerProvider()).toBeNull();
  });

  test("returns null for a non-matching RUNNER_NAME", () => {
    process.env.RUNNER_NAME = "GitHub Actions 1";
    expect(detectThirdPartyRunnerProvider()).toBeNull();
  });

  test("depot takes precedence over namespace", () => {
    process.env.DEPOT_RUNNER = "1";
    process.env.NAMESPACE_GITHUB_RUNTIME = "something";
    expect(detectThirdPartyRunnerProvider()).toBe("depot");
  });

  test("namespace takes precedence over warp runner name prefix", () => {
    process.env.NAMESPACE_GITHUB_RUNTIME = "something";
    process.env.RUNNER_NAME = "warp-x";
    expect(detectThirdPartyRunnerProvider()).toBe("namespace");
  });

  test("warp takes precedence over blacksmith when both prefixes seen (warp wins on name check order)", () => {
    process.env.RUNNER_NAME = "warp-x";
    expect(detectThirdPartyRunnerProvider()).toBe("warp");
  });
});

const SIGNED =
  "https://bucket.s3.us-west-2.amazonaws.com/runs/o/r/raw_events/1/process_events.json" +
  "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIAEXAMPLE%2F20260101%2Fus-west-2%2Fs3%2Faws4_request" +
  "&X-Amz-Date=20260101T000000Z&X-Amz-Expires=300&X-Amz-Security-Token=tokenvalue" +
  "&X-Amz-SignedHeaders=content-type%3Bhost&X-Amz-Signature=abc123";
const BASE = SIGNED.split("?")[0];

describe("redactSignedUrls", () => {
  test("an upload error quoting a signed URL", () => {
    const line = `[uploadEvents] unable to upload events: Put "${SIGNED}": context deadline exceeded`;
    expect(redactSignedUrls(line)).toBe(
      `[uploadEvents] unable to upload events: Put "${BASE}?REDACTED": context deadline exceeded`
    );
  });

  test("a signed URL in JSON-escaped output", () => {
    const escaped = SIGNED.replace(/&/g, "\\u0026");
    const out = redactSignedUrls(`{"msg":"Put \\"${escaped}\\": EOF"}`);
    expect(out).toBe(`{"msg":"Put \\"${BASE}?REDACTED\\": EOF"}`);
  });

  test("every signed URL on a line, whatever the parameter case", () => {
    const lower = SIGNED.replace("X-Amz-Signature", "x-amz-signature").replace(/X-Amz-(Credential|Security-Token)=[^&]*&?/g, "");
    const out = redactSignedUrls(`${SIGNED} ${lower}`);
    expect(out).toBe(`${BASE}?REDACTED ${BASE}?REDACTED`);
    for (const secret of ["ASIAEXAMPLE", "tokenvalue", "abc123"]) expect(out).not.toContain(secret);
  });

  test("other URLs and text are unchanged", () => {
    const text =
      "GET https://api.stepsecurity.io/v1/x?repo=o/r&run=1 ok\n" +
      "https://bucket.s3.amazonaws.com/file.json\nno URL here, X-Amz-Signature=abc\n";
    expect(redactSignedUrls(text)).toBe(text);
  });
});
