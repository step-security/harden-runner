import { shouldDeployAgentOnSelfHosted, isAgentInstalled, isPlatformSupported, getAnnotationLogs } from "./utils";
import * as fs from "fs";

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  existsSync: jest.fn(),
}));

const mockedExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

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
