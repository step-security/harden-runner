import * as tc from "@actions/tool-cache";
import * as core from "@actions/core";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { verifyChecksum } from "./checksum";
import { EOL } from "os";
import { ARM64_RUNNER_MESSAGE } from "./common";

export async function installAgent(
  isTLS: boolean,
  configStr: string
): Promise<boolean> {
  // Note: to avoid github rate limiting
  const token = core.getInput("token", { required: true });
  const auth = `token ${token}`;

  const variant = process.arch === "x64" ? "amd64" : "arm64";

  let downloadPath: string;

  fs.appendFileSync(process.env.GITHUB_STATE, `isTLS=${isTLS}${EOL}`, {
    encoding: "utf8",
  });

  if (isTLS) {
    downloadPath = await tc.downloadTool(
      `https://github.com/step-security/agent-ebpf/releases/download/v1.7.9/harden-runner_1.7.9_linux_${variant}.tar.gz`,
      undefined,
      auth
    );
  } else {
    if (variant === "arm64") {
      console.log(ARM64_RUNNER_MESSAGE);
      return false;
    }
    downloadPath = await tc.downloadTool(
      "https://github.com/step-security/agent/releases/download/v0.14.2/agent_0.14.2_linux_amd64.tar.gz",
      undefined,
      auth
    );
  }

  verifyChecksum(downloadPath, isTLS, variant, process.platform);

  const extractPath = await tc.extractTar(downloadPath);

  let cmd = "cp",
    args = [path.join(extractPath, "agent"), "/home/agent/agent"];

  cp.execFileSync(cmd, args);

  cp.execSync("chmod +x /home/agent/agent");

  fs.writeFileSync("/home/agent/agent.json", configStr);

  cmd = "sudo";
  args = [
    "cp",
    path.join(__dirname, "agent.service"),
    "/etc/systemd/system/agent.service",
  ];
  cp.execFileSync(cmd, args);
  cp.execSync("sudo systemctl daemon-reload");
  cp.execSync("sudo service agent start", { timeout: 15000 });
  return true;
}

export async function installWindowsAgent(
  configStr: string
): Promise<boolean> {
  const token = core.getInput("token", { required: true });
  const auth = `token ${token}`;

  const variant = process.arch === "x64" ? "amd64" : "arm64";
  if (variant === "arm64") {
    console.log(ARM64_RUNNER_MESSAGE);
    return false;
  }

  const agentDir = "C:\\agent";
  core.info(`Creating agent directory: ${agentDir}`);
  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
  }
  fs.appendFileSync(
    process.env.GITHUB_STATE,
    `agentDir=${agentDir}${EOL}`,
    {
      encoding: "utf8",
    }
  );
  const agentExePath = path.join(agentDir, "agent.exe");

  const downloadPath = await tc.downloadTool(
    `https://github.com/step-security/agent-releases/releases/download/v1.0.0-int/harden-runner-agent-windows_int_windows_amd64.tar.gz `,
    undefined,
    auth
  );
  verifyChecksum(downloadPath, false, variant, process.platform);

  const extractPath = await tc.extractTar(downloadPath);

  const extractedAgentPath = path.join(extractPath, "agent.exe");
  fs.copyFileSync(extractedAgentPath, agentExePath);
  core.info(`Copied agent from ${extractedAgentPath} to ${agentExePath}`);

  const configPath = path.join(agentDir, "config.json");
  fs.writeFileSync(configPath, configStr);
  core.info(`Created config file: ${configPath}`);

  core.info("Starting Windows Agent...");

  try {
    const logPath = path.join(agentDir, "agent.log");
    const logStream = fs.openSync(logPath, 'a');
    core.info(`Agent logs will be written to: ${logPath}`);

    const agentProcess = cp.spawn(agentExePath, [], {
      cwd: agentDir,
      detached: true,
      stdio: ['ignore', logStream, logStream],
      windowsHide: false,
      shell: false
    });

    const pidFile = path.join(agentDir, "agent.pid");
    fs.writeFileSync(pidFile, agentProcess.pid.toString());
    core.info(`Agent process started with PID: ${agentProcess.pid}`);
    core.info(`PID saved to: ${pidFile}`);

    agentProcess.unref();

    core.info("Windows Agent process started successfully");
    return true;
  } catch (error) {
    core.setFailed(
      `Failed to start Windows agent process: ${error.message}`
    );
    return false;
  }
}