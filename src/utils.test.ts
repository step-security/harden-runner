import { shouldDeployAgentOnSelfHosted, isAgentInstalled, isPlatformSupported, getAnnotationLogs, detectThirdPartyRunnerProvider, getPrivilegeMode } from "./utils";
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
