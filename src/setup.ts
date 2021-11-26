import * as core from "@actions/core";
import * as cp from "child_process";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { printInfo } from "./common";
import * as tc from "@actions/tool-cache";

(async () => {
  try {
    if (process.platform !== "linux") {
      console.log("Only runs on linux");
      return;
    }

    var correlation_id = uuidv4();
    var env = "agent";
    var api_url = `https://${env}.api.stepsecurity.io/v1`;
    var web_url = "https://app.stepsecurity.io";

    const confg = {
      repo: process.env["GITHUB_REPOSITORY"],
      run_id: process.env["GITHUB_RUN_ID"],
      correlation_id: correlation_id,
      working_directory: process.env["GITHUB_WORKSPACE"],
      api_url: api_url,
      allowed_endpoints: core.getInput("allowed-endpoints"),
    };

    const confgStr = JSON.stringify(confg);
    cp.execSync("sudo mkdir -p /home/agent");
    cp.execSync("sudo chown -R $USER /home/agent");

    const downloadPath: string = await tc.downloadTool(
      "https://github.com/step-security/agent/releases/download/v0.1.5/agent_0.1.5_linux_amd64.tar.gz"
    );
    const extractPath = await tc.extractTar(downloadPath);
    console.log(`Extracted to ${extractPath}`);

    console.log(`Step Security Job Correlation ID: ${correlation_id}`);
    printInfo(web_url);

    let cmd = "cp",
      args = [path.join(extractPath, "agent"), "/home/agent/agent"];
    cp.execFileSync(cmd, args);
    cp.execSync("chmod +x /home/agent/agent");

    fs.writeFileSync("/home/agent/agent.json", confgStr);

    cmd = "sudo";
    args = [
      "cp",
      path.join(__dirname, "agent.service"),
      "/etc/systemd/system/agent.service",
    ];
    cp.execFileSync(cmd, args);
    cp.execSync("sudo systemctl daemon-reload");
    cp.execSync("sudo service agent start", { timeout: 15000 });

    // Check that the file exists locally
    var statusFile = "/home/agent/agent.status";
    var logFile = "/home/agent/agent.log";
    var counter = 0;
    while (true) {
      if (!fs.existsSync(statusFile)) {
        counter++;
        if (counter > 30) {
          console.log("timed out");
          if (fs.existsSync(logFile)) {
            var content = fs.readFileSync(logFile, "utf-8");
            console.log(content);
          }
          break;
        }
        await sleep(300);
      } // The file *does* exist
      else {
        // Read the file
        var content = fs.readFileSync(statusFile, "utf-8");
        console.log(content);
        break;
      }
    }
  } catch (error) {
    core.setFailed(error.message);
  }
})();

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
