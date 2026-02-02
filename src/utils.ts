import * as cp from "child_process";
import * as fs from "fs";

export function isPlatformSupported(platform: string) {
  switch (platform) {
    case "linux":
    case "win32":
    case "darwin":
      return true;

    default:
      return false;
  }
}

export function chownForFolder(newOwner: string, target: string) {
  let cmd = "sudo";
  let args = ["chown", "-R", newOwner, target];
  cp.execFileSync(cmd, args);
}

export function isAgentInstalled(platform: string) {
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
