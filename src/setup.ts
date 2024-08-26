import * as core from "@actions/core";
import * as cp from "child_process";
import * as fs from "fs";
import * as httpm from "@actions/http-client";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import * as common from "./common";
import * as tc from "@actions/tool-cache";
import { verifyChecksum } from "./checksum";
import isDocker from "is-docker";
import { context } from "@actions/github";
import { EOL } from "os";
import {
  ArtifactCacheEntry,
  cacheKey,
  cacheFile,
  CompressionMethod,
  isValidEvent,
} from "./cache";
import { Configuration, PolicyResponse } from "./interfaces";
import { fetchPolicy, mergeConfigs } from "./policy-utils";
import * as cache from "@actions/cache";
import { getCacheEntry } from "@actions/cache/lib/internal/cacheHttpClient";
import * as utils from "@actions/cache/lib/internal/cacheUtils";
import { isArcRunner, sendAllowedEndpoints } from "./arc-runner";
import { STEPSECURITY_API_URL, STEPSECURITY_WEB_URL } from "./configs";
import { isGithubHosted, isTLSEnabled } from "./tls-inspect";

(async () => {
  try {
    if (process.platform !== "linux") {
      console.log(common.UBUNTU_MESSAGE);
      return;
    }
    if (isDocker()) {
      console.log(common.CONTAINER_MESSAGE);
      return;
    }

    var env = "int";
    var correlation_id = uuidv4();
    var api_url = STEPSECURITY_API_URL;
    var web_url = STEPSECURITY_WEB_URL;

    let confg: Configuration = {
      repo: process.env["GITHUB_REPOSITORY"],
      run_id: process.env["GITHUB_RUN_ID"],
      correlation_id: correlation_id,
      working_directory: process.env["GITHUB_WORKSPACE"],
      api_url: api_url,
      allowed_endpoints: core.getInput("allowed-endpoints"),
      egress_policy: core.getInput("egress-policy"),
      disable_telemetry: core.getBooleanInput("disable-telemetry"),
      disable_sudo: core.getBooleanInput("disable-sudo"),
      disable_file_monitoring: core.getBooleanInput("disable-file-monitoring"),
      private: context?.payload?.repository?.private || false,
      is_github_hosted: isGithubHosted(),
    };

    let policyName = core.getInput("policy");
    if (policyName !== "") {
      console.log(`Fetching policy from API with name: ${policyName}`);
      try {
        let idToken: string = await core.getIDToken();
        let result: PolicyResponse = await fetchPolicy(
          context.repo.owner,
          policyName,
          idToken
        );
        confg = mergeConfigs(confg, result);
      } catch (err) {
        core.info(`[!] ${err}`);
        core.setFailed(err);
      }
    }
    fs.appendFileSync(
      process.env.GITHUB_STATE,
      `disableSudo=${confg.disable_sudo}${EOL}`,
      {
        encoding: "utf8",
      }
    );
    core.info(`[!] Current Configuration: \n${JSON.stringify(confg)}\n`);

    if (confg.egress_policy !== "audit" && confg.egress_policy !== "block") {
      core.setFailed("egress-policy must be either audit or block");
    }

    if (confg.egress_policy === "block" && confg.allowed_endpoints === "") {
      core.warning(
        "egress-policy is set to block (default) and allowed-endpoints is empty. No outbound traffic will be allowed for job steps."
      );
    }

    if (confg.disable_telemetry !== true && confg.disable_telemetry !== false) {
      core.setFailed("disable-telemetry must be a boolean value");
    }

    if (isValidEvent() && confg.egress_policy === "block") {
      try {
        const cacheResult = await cache.saveCache(
          [path.join(__dirname, "cache.txt")],
          cacheKey
        );
        console.log(cacheResult);
      } catch (exception) {
        console.log(exception);
      }
      try {
        const compressionMethod: CompressionMethod =
          await utils.getCompressionMethod();
        const cacheFilePath = path.join(__dirname, "cache.txt");
        core.info(`cacheFilePath ${cacheFilePath}`);
        const cacheEntry: ArtifactCacheEntry = await getCacheEntry(
          [cacheKey],
          [cacheFilePath],
          {
            compressionMethod: compressionMethod,
          }
        );
        const url = new URL(cacheEntry.archiveLocation);
        core.info(`Adding cacheHost: ${url.hostname}:443 to allowed-endpoints`);
        confg.allowed_endpoints += ` ${url.hostname}:443`;
      } catch (exception) {
        // some exception has occurred.
        core.info(`Unable to fetch cacheURL`);
        if (confg.egress_policy === "block") {
          core.info("Switching egress-policy to audit mode");
          confg.egress_policy = "audit";
        }
      }
    }

    if (!confg.disable_telemetry || confg.egress_policy === "audit") {
      common.printInfo(web_url);
    }

    if (isArcRunner()) {
      console.log(`[!] ${common.ARC_RUNNER_MESSAGE}`);
      if (confg.egress_policy === "block") {
        sendAllowedEndpoints(confg.allowed_endpoints);
        await sleep(10000);
      }
      return;
    }

    const runnerName = process.env.RUNNER_NAME || "";
    core.info(`RUNNER_NAME: ${runnerName}`);
    if (!isGithubHosted()) {
      fs.appendFileSync(process.env.GITHUB_STATE, `selfHosted=true${EOL}`, {
        encoding: "utf8",
      });
      if (!fs.existsSync("/home/agent/agent")) {
        core.info(common.SELF_HOSTED_NO_AGENT_MESSAGE);
        return;
      }
      if (confg.egress_policy === "block") {
        try {
          if (process.env.USER) {
            cp.execSync(`sudo chown -R ${process.env.USER} /home/agent`);
          }
          const confgStr = JSON.stringify(confg);
          fs.writeFileSync("/home/agent/block_event.json", confgStr);
          await sleep(5000);
        } catch (error) {
          core.info(`[!] Unable to write block_event.json: ${error}`);
        }
      }
      return;
    }

    let _http = new httpm.HttpClient();
    let statusCode;
    _http.requestOptions = { socketTimeout: 3 * 1000 };
    try {
      const resp: httpm.HttpClientResponse = await _http.get(
        `${api_url}/github/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]}/monitor`
      );
      statusCode = resp.message.statusCode; // adding error code to check whether agent is getting installed or not.
      fs.appendFileSync(
        process.env.GITHUB_STATE,
        `monitorStatusCode=${statusCode}${EOL}`,
        {
          encoding: "utf8",
        }
      );
    } catch (e) {
      console.log(`error in connecting to ${api_url}: ${e}`);
    }

    console.log(`Step Security Job Correlation ID: ${correlation_id}`);
    if (String(statusCode) === common.STATUS_HARDEN_RUNNER_UNAVAILABLE) {
      console.log(common.HARDEN_RUNNER_UNAVAILABLE_MESSAGE);
      return;
    }

    const confgStr = JSON.stringify(confg);
    cp.execSync("sudo mkdir -p /home/agent");
    cp.execSync("sudo chown -R $USER /home/agent");

    // Note: to avoid github rate limiting
    let token = core.getInput("token");
    let auth = `token ${token}`;

    let downloadPath: string;

    if (await isTLSEnabled(context.repo.owner)) {
      downloadPath = await tc.downloadTool(
        "https://packages.stepsecurity.io/github-hosted/harden-runner_1.1.0_linux_amd64.tar.gz"
      );
      verifyChecksum(downloadPath, true); // NOTE: verifying tls_agent's checksum, before extracting
      downloadPath = await tc.extractTar(downloadPath);
      downloadPath = path.join(downloadPath, "agent");
    } else {
      downloadPath = await tc.downloadTool(
        `https://step-security-agent.s3.us-west-2.amazonaws.com/refs/heads/self-hosted/${env}/agent`
      );

      //verifyChecksum(downloadPath, false); // NOTE: verifying agent's checksum, before extracting
    }

    let cmd = "cp",
      args = [downloadPath, "/home/agent/agent"];

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
  // see https://github.com/ruby/setup-ruby/issues/543
  process.exit(0);
})();

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
