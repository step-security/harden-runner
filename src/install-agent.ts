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

  // set up agent directory at C:\agent
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

  // uncomment to download agent from github
  // const downloadPath = await tc.downloadTool(
  //   `https://github.com/step-security/agent-releases/releases/download/v0.0.1/agent_0.0.1_windows_amd64.tar.gz`,
  //   undefined,
  //   auth
  // );
  // verifyChecksum(downloadPath, false, variant, process.platform);

  // const extractPath = await tc.extractTar(downloadPath);
  // let cmd = "cp",
  //   args = [path.join(extractPath, "agent.exe"), agentExePath];

  // cp.execFileSync(cmd, args);

  // Download Windows agent from S3 - TODO: remove this later once github releases are available
  // Get S3 URL from environment variable or GitHub Actions input
  const s3Url = process.env.AGENT_S3_URL || core.getInput("agent-s3-url");

  if (!s3Url) {
    core.setFailed(
      "S3 URL not configured. Please set AGENT_S3_URL environment variable or provide 'agent-s3-url' input."
    );
    return false;
  }

  const tarGzPath = path.join(agentDir, "agent_windows_amd64.tar.gz");

  core.info(`Downloading Windows agent from S3...`);

  try {
    // Download tar.gz from S3 using curl
    core.info(`Downloading from: ${s3Url}`);
    cp.execSync(`curl -L -o "${tarGzPath}" "${s3Url}"`, { stdio: "inherit" });

    if (!fs.existsSync(tarGzPath)) {
      core.setFailed("Failed to download agent.tar.gz from S3");
      return false;
    }

    core.info(`Downloaded tar.gz to: ${tarGzPath}`);

    // Extract tar.gz
    core.info("Extracting tar.gz...");
    cp.execSync(`tar -xzf "${tarGzPath}" -C "${agentDir}"`, { stdio: "inherit" });

    // Verify agent.exe exists after extraction
    if (fs.existsSync(agentExePath)) {
      core.info(`Agent extracted to: ${agentExePath}`);

      // Clean up tar.gz
      fs.unlinkSync(tarGzPath);
    } else {
      core.setFailed("agent.exe not found after extraction");
      return false;
    }
  } catch (error) {
    core.setFailed(`Failed to download Windows agent: ${error.message}`);
    return false;
  }

  // Write config.json
  const configPath = path.join(agentDir, "config.json");
  fs.writeFileSync(configPath, configStr);
  core.info(`Created config file: ${configPath}`);

  core.info("Starting Windows Agent...");

  try {
    // start the agent process in the background
    core.info(`Executing: ${agentExePath}`);

    // set up log file for agent output
    const logPath = path.join(agentDir, "agent.log");
    const logStream = fs.openSync(logPath, 'a');
    core.info(`Agent logs will be written to: ${logPath}`);

    const { spawn } = require('child_process');
    const agentProcess = spawn(agentExePath, [], {
      cwd: agentDir,
      detached: true,
      stdio: ['ignore', logStream, logStream],
      windowsHide: false,
      shell: false
    });

    // save the PID to a file for later termination
    const pidFile = path.join(agentDir, "agent.pid");
    fs.writeFileSync(pidFile, agentProcess.pid.toString());
    core.info(`Agent process started with PID: ${agentProcess.pid}`);
    core.info(`PID saved to: ${pidFile}`);

    // unref the process so it can continue running independently
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