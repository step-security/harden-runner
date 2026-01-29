import * as tc from "@actions/tool-cache";
import * as core from "@actions/core";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { verifyChecksum } from "./checksum";
import { EOL } from "os";
import { ARM64_RUNNER_MESSAGE, chownForFolder } from "./common";

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

export async function installMacosAgent(confgStr: string): Promise<boolean> {
  const token = core.getInput("token", { required: true });
  const auth = `token ${token}`;

  try {
    // Create working directory
    core.info("Creating /opt/step-security directory...");
    cp.execSync("sudo mkdir -p /opt/step-security");
    chownForFolder(process.env.USER, "/opt/step-security");
    core.info("✓ Successfully created /opt/step-security directory");

    // Create agent configuration file
    core.info("Creating agent.json");
    fs.writeFileSync("/opt/step-security/agent.json", confgStr);
    core.info(
      "✓ Successfully created agent.json at /opt/step-security/agent.json"
    );

    // Download installer package
    const downloadUrl =
      "https://github.com/step-security/agent-releases/releases/download/v1.0.0-int/macos-installer-0.0.1.tar.gz";
    core.info(`Downloading macOS installer.. : ${downloadUrl}`);
    const downloadPath = await tc.downloadTool(downloadUrl);
    core.info(`✓ Successfully downloaded installer to: ${downloadPath}`);

    // Verify SHA256 checksum
    core.info("Verifying SHA256 checksum of downloaded tar file...");
    verifyChecksum(downloadPath, false, "", "darwin");

    // Extract installer package
    core.info("Extracting installer...");
    const extractPath = await tc.extractTar(downloadPath);
    core.info(`✓ Successfully extracted installer to: ${extractPath}`);

    // Copy Installer binary to /opt/step-security
    const installerSourcePath = path.join(extractPath, "Installer");
    core.info(
      `Copying Installer from ${installerSourcePath} to /opt/step-security...`
    );
    cp.execSync(`cp "${installerSourcePath}" /opt/step-security/`);
    core.info("✓ Successfully copied Installer to /opt/step-security");

    const installerBinaryPath = "/opt/step-security/Installer";

    // Verify installer binary exists
    if (!fs.existsSync(installerBinaryPath)) {
      throw new Error(
        "Installer binary not found at /opt/step-security/Installer"
      );
    }
    core.info("✓ Installer binary verified");

    // Make installer executable
    core.info("Making installer executable...");
    cp.execSync(`chmod +x "${installerBinaryPath}"`);
    core.info("✓ Installer is now executable");

    // Run installer
    core.info("Running installer...");
    cp.execSync(
      `sudo "${installerBinaryPath}" -workdir /opt/step-security >> /opt/step-security/agent.log 2>&1`,
      {
        shell: "/bin/bash",
        timeout: 10000, // 10 second timeout
      }
    );
    core.info("✓ Installer completed successfully");

    core.info("✅ macOS agent installation completed successfully");
    return true;
  } catch (error) {
    core.error(`❌ Failed to install macOS agent: ${error}`);
    if (error instanceof Error && error.stack) {
      core.debug(error.stack);
    }
    return false;
  }
}
