import * as core from "@actions/core";
import { context } from "@actions/github/lib/utils";
import * as cp from "child_process";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

(async () => {
  try {
    if (process.platform !== "linux") {
      console.log("Only runs on linux");
      return;
    }

    var correlation_id = uuidv4();
    var env = "beta";
    var api_url = `https://${env}.api.stepsecurity.io/v1`;

    const confg = {
      repo: process.env["GITHUB_REPOSITORY"],
      run_id: process.env["GITHUB_RUN_ID"],
      correlation_id: correlation_id,
      working_directory: process.env["GITHUB_WORKSPACE"],
      api_url: api_url,
    };

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
            core.notice(correlation_id, { title: "1234" });
            cp.execSync(`cp ${__dirname}/agent /home/agent/agent`);
            cp.execSync("chmod +x /home/agent/agent");

            fs.writeFileSync("/home/agent/agent.json", confgStr);

            cp.execSync(
              `sudo cp ${__dirname}/agent.service /etc/systemd/system/agent.service`
            );
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
