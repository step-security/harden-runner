import * as core from "@actions/core";
import { context } from "@actions/github/lib/utils";
import * as cp from "child_process";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import * as httpm from "@actions/http-client";

(async () => {
  try {
    if (process.platform !== "linux") {
      console.log("Only runs on linux");
      return;
    }

    var correlation_id = uuidv4();
    var env = "int";
    var api_url = `https://${env}.api.stepsecurity.io/v1`;
    var web_url = "https://int1.stepsecurity.io";

    const confg = {
      repo: process.env["GITHUB_REPOSITORY"],
      run_id: process.env["GITHUB_RUN_ID"],
      correlation_id: correlation_id,
      working_directory: process.env["GITHUB_WORKSPACE"],
      api_url: api_url,
      allowed_endpoints: core.getInput("allowed-endpoints"),
    };

    let _http = new httpm.HttpClient();
    await _http.get(`${api_url}/v1/github/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]}/monitor`);

    const confgStr = JSON.stringify(confg);
    cp.execSync("sudo mkdir -p /home/agent");
    cp.execSync("sudo chown -R $USER /home/agent");

    const filename = path.join(__dirname, "agent");
    https.get(
      `https://step-security-agent.s3.us-west-2.amazonaws.com/refs/heads/${env}/agent`,
      (res) => {
        const filePath = fs.createWriteStream(filename);
        res.pipe(filePath);
        filePath
          .on("error", (err) => {})
          .on("finish", async () => {
            filePath.close();

            console.log(`Step Security Job Correlation ID: ${correlation_id}`);
            console.log(
              `View security insights and recommended policy at ${web_url}/github/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]} after the run has finished`
            );
            let cmd = "cp",
              args = [path.join(__dirname, "agent"), "/home/agent/agent"];
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
          });
      }
    );
  } catch (error) {
    core.setFailed(error.message);
  }
})();

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
