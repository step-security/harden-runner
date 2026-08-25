import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";

export function isPlatformSupported(platform: NodeJS.Platform) {
  switch (platform) {
    case "linux":
    case "win32":
    case "darwin":
      return true;

    default:
      return false;
  }
}

// Resolves the user the runner process is executing as. Some runner
// environments (e.g. AWS CodeBuild-hosted runners) do not set the USER
// environment variable.
export function getRunnerUser(): string | undefined {
  if (process.env.USER) {
    return process.env.USER;
  }
  try {
    return os.userInfo().username;
  } catch {
    return undefined;
  }
}

// How the current process should obtain root privileges. Some runner
// environments (e.g. AWS CodeBuild containers) run as root without the
// sudo binary installed.
export type PrivilegeMode = "root" | "sudo";

export function getPrivilegeMode(): PrivilegeMode {
  try {
    if (os.userInfo().uid === 0) {
      return "root";
    }
  } catch {
    // fall through to sudo
  }
  return "sudo";
}

export function chownForFolder(
  newOwner: string | undefined,
  target: string,
  useDirectPrivileges: boolean = false
) {
  if (!newOwner) {
    console.log(`Unable to determine runner user; skipping chown of ${target}`);
    return;
  }
  if (useDirectPrivileges) {
    cp.execFileSync("chown", ["-R", newOwner, target]);
  } else {
    cp.execFileSync("sudo", ["chown", "-R", newOwner, target]);
  }
}

export function isAgentInstalled(platform: NodeJS.Platform) {
  switch (platform) {
    case "linux":
      return fs.existsSync("/home/agent/agent.status");
    case "win32":
      return fs.existsSync("C:\\agent\\agent.status");
    case "darwin":
      return fs.existsSync("/opt/step-security/agent.status");
    default:
      return false;
  }
}

export function shouldDeployAgentOnSelfHosted(
  deployOnSelfHostedVm: boolean,
  isContainer: boolean,
  agentAlreadyInstalled: boolean
): boolean {
  return deployOnSelfHostedVm && !isContainer && !agentAlreadyInstalled;
}

export type ThirdPartyRunnerProvider = "depot" | "namespace" | "warp" | "blacksmith" | "bitrise" | "codebuild";

export function detectThirdPartyRunnerProvider(): ThirdPartyRunnerProvider | null {
  if (process.env["DEPOT_RUNNER"] === "1") return "depot";
  if (process.env["NAMESPACE_GITHUB_RUNTIME"]) return "namespace";
  if (process.env["BITRISE_IO"]) return "bitrise";
  if (process.env["CODEBUILD_RUNNER_TYPE"] === "GITHUB") return "codebuild";
  const runnerName = process.env["RUNNER_NAME"] ?? "";
  if (runnerName.startsWith("warp-")) return "warp";
  if (runnerName.startsWith("blacksmith-")) return "blacksmith";
  return null;
}

export function getAnnotationLogs(platform: NodeJS.Platform) {
  switch (platform) {
    case "linux":
      return fs.readFileSync("/home/agent/annotation.log", "utf8");
    case "win32":
      return fs.readFileSync("C:\\agent\\annotation.log", "utf8");
    case "darwin":
      return fs.readFileSync("/opt/step-security/annotation.log", "utf8");
    default:
      throw new Error("platform not supported");
  }
}
