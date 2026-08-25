import * as core from "@actions/core";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import * as common from "./common";
import isDocker from "is-docker";
import { context } from "@actions/github";
import { EOL } from "os";
import {
  ArtifactCacheEntry,
  cacheKey,
  cacheFile,
  isValidEvent,
} from "./cache";
import { Configuration, PolicyResponse } from "./interfaces";
import { fetchPolicy, fetchPolicyFromStore, mergeConfigs } from "./policy-utils";
import * as cache from "@actions/cache";
import { getCacheEntry } from "@actions/cache/lib/internal/cacheHttpClient";
import * as cacheTwirpClient from "@actions/cache/lib/internal/shared/cacheTwirpClient";
import { GetCacheEntryDownloadURLRequest } from "@actions/cache/lib/generated/results/api/v1/cache";
import { getCacheServiceVersion } from "@actions/cache/lib/internal/config";

import * as utils from "@actions/cache/lib/internal/cacheUtils";
import { isARCRunner, sendAllowedEndpoints } from "./arc-runner";
import {
  STEPSECURITY_API_URL,
  STEPSECURITY_TELEMETRY_URL,
  STEPSECURITY_WEB_URL,
} from "./configs";
import { isGithubHosted, isTLSEnabled } from "./tls-inspect";
import {
  installAgent,
  installAgentBravo,
  installMacosAgent,
  installWindowsAgent,
} from "./install-agent";

import { chownForFolder, getRunnerUser, getPrivilegeMode, detectThirdPartyRunnerProvider, isAgentInstalled, isPlatformSupported, shouldDeployAgentOnSelfHosted, ThirdPartyRunnerProvider } from "./utils";
import { buildBravoConfig } from "./bravo-config";

interface MonitorResponse {
  runner_ip_address?: string;
  one_time_key?: string;
  monitoring_started?: boolean;
}

// Node 22+ terminates the process on unhandled promise rejections by default.
// Third-party libraries used during Pre-step (notably @actions/cache's tar +
// upload streams under concurrent matrix runs) can emit background rejections
// that escape our try/catch, killing Pre-step silently and leaving the runner
// without an agent installed. Log and continue instead.
process.on("unhandledRejection", (reason) => {
  const detail =
    reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  core.warning(`Unhandled promise rejection during Pre-step: ${detail}`);
});

// Looks up the Actions cache blob host for the harden-runner cache entry.
// Returns "<hostname>:443", or undefined when the entry does not exist yet.
async function lookupCacheHost(): Promise<string | undefined> {
  const cacheFilePath = path.join(__dirname, "cache.txt");
  const compressionMethod = await utils.getCompressionMethod();
  const cacheServiceVersion = getCacheServiceVersion();

  if (cacheServiceVersion === "v2") {
    const twirpClient = cacheTwirpClient.internalCacheTwirpClient();
    const request: GetCacheEntryDownloadURLRequest = {
      key: cacheKey,
      restoreKeys: [],
      version: utils.getCacheVersion([cacheFilePath], compressionMethod, false),
    };
    const response = await twirpClient.GetCacheEntryDownloadURL(request);
    // On a cache miss the twirp response is {ok: false, signedDownloadUrl: ""};
    // constructing a URL from that empty string would throw.
    if (!response.ok || !response.signedDownloadUrl) {
      return undefined;
    }
    return `${new URL(response.signedDownloadUrl).hostname}:443`;
  }

  if (cacheServiceVersion === "v1") {
    const cacheEntry: ArtifactCacheEntry = await getCacheEntry(
      [cacheKey],
      [cacheFilePath],
      { compressionMethod }
    );
    // On a cache miss getCacheEntry returns null.
    if (!cacheEntry?.archiveLocation) {
      return undefined;
    }
    return `${new URL(cacheEntry.archiveLocation).hostname}:443`;
  }

  return undefined;
}

// Resolves the Actions cache blob host, seeding the harden-runner cache entry
// on the first run in a cache scope. Read-first: the constant-key entry can
// only be reserved once per scope, so an unconditional save would log a
// misleading reservation failure on every subsequent run. Returns undefined
// when the host cannot be resolved; callers must not change the egress policy
// in that case, the agent allows the cache endpoints implicitly and this
// lookup is defense-in-depth only.
async function resolveCacheHost(): Promise<string | undefined> {
  core.info(`cache version: ${getCacheServiceVersion()}`);

  try {
    const host = await lookupCacheHost();
    if (host) {
      return host;
    }
  } catch (e) {
    core.info(`Unable to fetch cacheURL ${e}`);
  }

  // First run in this cache scope: seed the entry, then look up again. If a
  // concurrent job wins the reservation race, saveCache fails harmlessly and
  // the second lookup reads the winner's entry.
  try {
    await cache.saveCache([path.join(__dirname, "cache.txt")], cacheKey);
  } catch (exception) {
    core.info(`Unable to seed cache entry: ${exception}`);
  }

  try {
    return await lookupCacheHost();
  } catch (e) {
    core.info(`Unable to fetch cacheURL ${e}`);
    return undefined;
  }
}

(async () => {
  try {
    console.log("[harden-runner] pre-step");

    const customProperties = context?.payload?.repository?.custom_properties || {};
    if (customProperties["skip-harden-runner"] === "true") {
      console.log("Skipping harden-runner: custom property 'skip-harden-runner' is set to 'true'");
      return;
    }

    if (!isPlatformSupported(process.platform)) {
      console.log(common.UNSUPPORTED_RUNNER_MESSAGE);
      return;
    }
    if (isGithubHosted() && isDocker()) {
      console.log(common.CONTAINER_MESSAGE);
      return;
    }

    if (isGithubHosted() && process.platform === "linux" && !process.env.USER) {
      console.log(common.UBUNTU_SLIM_MESSAGE);
      return;
    }

    var correlation_id = uuidv4();
    var api_url = STEPSECURITY_API_URL;
    var web_url = STEPSECURITY_WEB_URL;

    let confg: Configuration = {
      repo: process.env["GITHUB_REPOSITORY"],
      run_id: process.env["GITHUB_RUN_ID"],
      correlation_id: correlation_id,
      working_directory: process.env["GITHUB_WORKSPACE"],
      api_url: api_url,
      telemetry_url: STEPSECURITY_TELEMETRY_URL,
      allowed_endpoints: core.getInput("allowed-endpoints"),
      denied_endpoints: core.getInput("denied-endpoints"),
      egress_policy: core.getInput("egress-policy"),
      disable_telemetry: core.getBooleanInput("disable-telemetry"),
      disable_sudo: core.getBooleanInput("disable-sudo"),
      disable_sudo_and_containers: core.getBooleanInput(
        "disable-sudo-and-containers"
      ),
      disable_file_monitoring: core.getBooleanInput("disable-file-monitoring"),
      private: context?.payload?.repository?.private || false,
      is_github_hosted: isGithubHosted(),
      is_debug: core.isDebug(),
      one_time_key: "",
      api_key: core.getInput("api-key"),
      use_policy_store: core.getBooleanInput("use-policy-store"),
      deploy_on_self_hosted_vm: core.getBooleanInput("deploy-on-self-hosted-vm"),
    };

    if (confg.api_key !== "") {
      core.setSecret(confg.api_key);
    }

    let policyName = core.getInput("policy");
    if (confg.use_policy_store) {
      console.log(`Fetching policy from policy store`);
      if (confg.api_key === "") {
        core.warning(
          "api-key is not set while use-policy-store is true. Defaulting to audit mode."
        );
        confg.egress_policy = "audit";
      } else {
        try {
          const repoName = (process.env["GITHUB_REPOSITORY"] || "").split("/")[1] || "";
          const workflowRef = process.env["GITHUB_WORKFLOW_REF"] || "";
          const workflow = workflowRef.replace(/.*\.github\/workflows\//, "").replace(/@.*/, "");
          let result: PolicyResponse | null = await fetchPolicyFromStore(
            context.repo.owner,
            repoName,
            confg.api_key,
            workflow,
            confg.run_id,
            confg.correlation_id
          );
          if (result !== null) {
            core.info(`Policy found: ${result.policy_name || "unnamed"}`);
            confg = mergeConfigs(confg, result);
          } else {
            core.info("No policy found in policy store. Defaulting to audit mode.");
            confg.egress_policy = "audit";
          }
        } catch (err) {
          core.info(`[!] ${err}`);
          if (err.statusCode >= 400 && err.statusCode < 500) {
            core.info("Policy not found in policy store. Defaulting to audit mode.");
            confg.egress_policy = "audit";
          } else {
            core.error(`Unexpected error fetching from policy store: ${err}. Falling back to audit mode.`);
            confg.egress_policy = "audit";
          }
        }
      }
    } else if (policyName !== "") {
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
        // Only fail the job if ID token is not available
        if (err.message && err.message.includes('Unable to get ACTIONS_ID_TOKEN_REQUEST')) {
          core.setFailed('Policy store requires id-token write permission as it uses OIDC to fetch the policy from StepSecurity API. Please add "id-token: write" to your job permissions.');
        } else {
          // Handle different HTTP status codes
          if (err.statusCode >= 400 && err.statusCode < 500) {
            core.error('Policy not found');
          } else {
            core.error(`Unexpected error occurred: ${err}. Falling back to egress policy audit`);
            confg.egress_policy = 'audit';
          }
        }
      }
    }
    fs.appendFileSync(
      process.env.GITHUB_STATE,
      `disableSudo=${confg.disable_sudo}${EOL}`,
      {
        encoding: "utf8",
      }
    );
    fs.appendFileSync(
      process.env.GITHUB_STATE,
      `disableSudoAndContainers=${confg.disable_sudo_and_containers}${EOL}`,
      {
        encoding: "utf8",
      }
    );
    core.info(`[!] Current Configuration: \n${JSON.stringify(confg)}\n`);

    if (confg.egress_policy !== "audit" && confg.egress_policy !== "block") {
      core.setFailed("egress-policy must be either audit or block");
    }

    // Mirrors the agent's isDenyList() decision: the deny list is enforced
    // only when there are no allowed endpoints. Allowed endpoints always win.
    let isDenyListMode =
      confg.denied_endpoints !== "" && confg.allowed_endpoints === "";

    if (confg.denied_endpoints !== "" && confg.allowed_endpoints !== "") {
      core.info(
        "Both allowed-endpoints and denied-endpoints are set. Only one of them should be set at a time. allowed-endpoints will be honored and denied-endpoints will be ignored."
      );
    }

    // The deny list is an enterprise (TLS) tier feature. The non-TLS agent
    // does not understand denied_endpoints and would treat this config as
    // block with an empty allow list, blocking all egress.
    if (isDenyListMode && !(await isTLSEnabled(context.repo.owner))) {
      core.info(
        "denied-endpoints is supported on the enterprise tier only. Ignoring denied-endpoints for this run."
      );
      confg.denied_endpoints = "";
      isDenyListMode = false;
    }

    if (
      confg.egress_policy === "block" &&
      confg.allowed_endpoints === "" &&
      !isDenyListMode
    ) {
      core.warning(
        "egress-policy is set to block (default) and both allowed-endpoints and denied-endpoints are empty. No outbound traffic rules will be configured for job steps."
      );
    }

    if (confg.disable_telemetry !== true && confg.disable_telemetry !== false) {
      core.setFailed("disable-telemetry must be a boolean value");
    }

    if (
      isValidEvent() &&
      confg.egress_policy === "block" &&
      !isDenyListMode
    ) {
      const cacheHost = await resolveCacheHost();
      if (cacheHost) {
        core.info(`Adding cacheHost: ${cacheHost} to allowed-endpoints`);
        confg.allowed_endpoints += ` ${cacheHost}`;
      } else {
        core.info(
          "Unable to resolve the Actions cache host. This should not cause any problems: the agent allows the cache endpoints implicitly, and this lookup is defense-in-depth only. Egress policy remains block."
        );
      }
    }

    if (!confg.disable_telemetry || confg.egress_policy === "audit") {
      common.printInfo(web_url);
    }

    if (isARCRunner()) {
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
      const thirdPartyProvider = detectThirdPartyRunnerProvider();
      if (thirdPartyProvider) {
        const providerLabel = thirdPartyProvider.charAt(0).toUpperCase() + thirdPartyProvider.slice(1);
        if (process.platform !== "linux" && process.platform !== "darwin") {
          core.info(`Detected ${providerLabel} runner on ${process.platform}. HardenRunner is not supported on this third-party provider, skipping install.`);
          return;
        }
        core.info(`Detected ${providerLabel} runner environment. Installing agent-bravo.`);
        confg.correlation_id = runnerName || confg.correlation_id;
        await callMonitorEndpoint(api_url, confg);
        const bravoConfigStr = JSON.stringify(buildBravoConfig(confg));
        switch (process.platform) {
          case "darwin": {
            const installed = await installMacosAgent(bravoConfigStr);
            if (!installed) {
              core.warning("macos bravo agent installation failed");
            }
            return;
          }
          case "linux":
            await installAgentForBravo(context.repo.owner, bravoConfigStr, thirdPartyProvider);
            return;
        }
      }

      fs.appendFileSync(process.env.GITHUB_STATE, `selfHosted=true${EOL}`, {
        encoding: "utf8",
      });

      core.info(common.SELF_HOSTED_RUNNER_MESSAGE);

      const inContainer = isDocker();
      const alreadyInstalled = isAgentInstalled(process.platform);

      if (shouldDeployAgentOnSelfHosted(confg.deploy_on_self_hosted_vm, inContainer, alreadyInstalled)) {
        if (process.platform !== "linux") {
          core.info("deploy-on-self-hosted-vm is only supported on Linux. Skipping agent deployment.");
        } else {
          core.info("deploy-on-self-hosted-vm is enabled. Installing agent on self-hosted runner.");
          await installAgentForSelfHosted(context.repo.owner, confg);
        }
      } else {
        if (confg.deploy_on_self_hosted_vm && inContainer) {
          core.info("Skipping agent deployment: running inside a container.");
        }
        if (confg.deploy_on_self_hosted_vm && alreadyInstalled) {
          core.info("Agent already installed on self-hosted runner, skipping installation.");
        }
      }

      if (confg.egress_policy === "block" && !confg.deploy_on_self_hosted_vm) {
        sendAllowedEndpoints(confg.allowed_endpoints);
        await sleep(5000);
      }
      return;
    }

    if (isGithubHosted() && process.env.STEP_SECURITY_HARDEN_RUNNER === "true") {
      fs.appendFileSync(process.env.GITHUB_STATE, `customVMImage=true${EOL}`, {
        encoding: "utf8",
      });

      core.info("This job is running on a custom VM image with Harden Runner installed.");

      if (confg.egress_policy === "block") {
        sendAllowedEndpoints(confg.allowed_endpoints);
        await sleep(5000);
      }
      return;
    }

    if (isGithubHosted() && isAgentInstalled(process.platform)) {
      console.log("Agent already installed, skipping installation");
      return;
    }

    let statusCode: number | undefined;
    let addSummary = "false";
    try {
      const monitorRequestData = {
        correlation_id: correlation_id,
        job: process.env["GITHUB_JOB"],
      };
      const url = `${api_url}/github/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]}/monitor`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(monitorRequestData),
        signal: AbortSignal.timeout(3000),
      });

      statusCode = resp.status;
      const responseData = resp.ok
        ? ((await resp.json()) as MonitorResponse)
        : undefined;
      fs.appendFileSync(
        process.env.GITHUB_STATE,
        `monitorStatusCode=${statusCode}${EOL}`,
        {
          encoding: "utf8",
        }
      );

      if (statusCode === 200 && responseData) {
        console.log(`Runner IP Address: ${responseData.runner_ip_address}`);
        confg.one_time_key = responseData.one_time_key;
        addSummary = responseData.monitoring_started ? "true" : "false";
      }
    } catch (e) {
      console.log(`error in connecting to ${api_url}: ${e}`);
    }
    fs.appendFileSync(
      process.env.GITHUB_STATE,
      `addSummary=${addSummary}${EOL}`,
      {
        encoding: "utf8",
      }
    );
    fs.appendFileSync(
      process.env.GITHUB_STATE,
      `correlation_id=${correlation_id}${EOL}`,
      {
        encoding: "utf8",
      }
    );

    console.log(`Step Security Job Correlation ID: ${correlation_id}`);
    if (String(statusCode) === common.STATUS_HARDEN_RUNNER_UNAVAILABLE) {
      console.log(common.HARDEN_RUNNER_UNAVAILABLE_MESSAGE);
      return;
    }

    const { api_key, use_policy_store, ...agentConfig } = confg;
    const configStr = JSON.stringify(agentConfig);

    // platform specific
    let statusFile = "";
    let logFile = "";
    let agentInstalled = false;

    switch (process.platform) {
      case "linux":
        statusFile = "/home/agent/agent.status";
        logFile = "/home/agent/agent.log";

        cp.execSync("sudo mkdir -p /home/agent");
        chownForFolder(getRunnerUser(), "/home/agent");

        let isTLS = await isTLSEnabled(context.repo.owner);
        agentInstalled = await installAgent(isTLS, configStr);

        break;
      case "win32":
        core.info("Installing Windows Agent...");
        agentInstalled = await installWindowsAgent(configStr);

        const agentDir = process.env.STATE_agentDir || "C:\\agent";
        statusFile = path.join(agentDir, "agent.status");
        logFile = path.join(agentDir, "agent.log");

        break;
      case "darwin":
        const installed = await installMacosAgent(configStr);
        if (!installed) {
          core.warning("😭 macos agent installation failed");
        }
        return; // early return
      default:
        throw new Error(
          `Setup failed because of unsupported platform: ${process.platform}`
        );
    }

    if (agentInstalled) {
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
    }
  } catch (error) {
    core.setFailed(error.message);
  }
  // see https://github.com/ruby/setup-ruby/issues/543
  process.exit(0);
})();

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function callMonitorEndpoint(api_url: string, confg: Configuration) {
  let statusCode: number | undefined;
  let addSummary = "false";
  try {
    const monitorRequestData = {
      correlation_id: confg.correlation_id,
      job: process.env["GITHUB_JOB"],
    };
    const url = `${api_url}/github/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]}/monitor`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(monitorRequestData),
      signal: AbortSignal.timeout(3000),
    });
    statusCode = resp.status;
    if (resp.ok) {
      const result = (await resp.json()) as MonitorResponse;
      console.log(`Runner IP Address: ${result.runner_ip_address}`);
      confg.one_time_key = result.one_time_key;
      addSummary = result.monitoring_started ? "true" : "false";
    }
  } catch (e) {
    console.log(`error in connecting to ${api_url}: ${e}`);
  }
  fs.appendFileSync(process.env.GITHUB_STATE, `monitorStatusCode=${statusCode}${EOL}`, { encoding: "utf8" });
  fs.appendFileSync(process.env.GITHUB_STATE, `addSummary=${addSummary}${EOL}`, { encoding: "utf8" });
  fs.appendFileSync(process.env.GITHUB_STATE, `correlation_id=${confg.correlation_id}${EOL}`, { encoding: "utf8" });
}

export async function installAgentForSelfHosted(owner: string, confg: Configuration) {
  try {
    console.log("Installing Harden Runner agent for self-hosted runner");

    let isTLS = await isTLSEnabled(owner);

    if (!isTLS) {
      console.log("TLS is not enabled for this organization. Agent installation skipped for self-hosted runner.");
      return;
    }

    const selfHostedConfig = {
      customer: owner,
      working_directory: confg.working_directory,
      api_url: confg.api_url,
      api_key: uuidv4(),
      allowed_endpoints: confg.allowed_endpoints,
      denied_endpoints: confg.denied_endpoints,
      egress_policy: confg.egress_policy,
      disable_telemetry: confg.disable_telemetry,
      disable_sudo: confg.disable_sudo,
      disable_sudo_and_containers: confg.disable_sudo_and_containers,
      disable_file_monitoring: confg.disable_file_monitoring,
      is_github_hosted: false,
    };
    const selfHostedConfigStr = JSON.stringify(selfHostedConfig);

    cp.execSync("sudo mkdir -p /home/agent");
    chownForFolder(getRunnerUser(), "/home/agent");

    const agentInstalled = await installAgent(isTLS, selfHostedConfigStr);

    if (agentInstalled) {
      const statusFile = "/home/agent/agent.status";
      const logFile = "/home/agent/agent.log";
      let counter = 0;
      while (true) {
        if (!fs.existsSync(statusFile)) {
          counter++;
          if (counter > 30) {
            console.log("timed out");
            if (fs.existsSync(logFile)) {
              const content = fs.readFileSync(logFile, "utf-8");
              console.log(content);
            }
            break;
          }
          await sleep(300);
        } else {
          const content = fs.readFileSync(statusFile, "utf-8");
          console.log(content);
          break;
        }
      }
    }
  } catch (error) {
    console.log(`Failed to install agent for self-hosted runner: ${error.message}`);
  }
}

export async function installAgentForBravo(
  owner: string,
  bravoConfigStr: string,
  provider: ThirdPartyRunnerProvider
) {
  try {
    console.log("Installing Harden Runner bravo agent for third-party runner");

    let isTLS = await isTLSEnabled(owner);

    if (!isTLS) {
      console.log("TLS is not enabled for this organization. Bravo agent installation skipped.");
      return;
    }

    const privilegeMode = getPrivilegeMode();

    if (isDocker() && privilegeMode !== "root") {
      console.log(
        "Running inside a container without root privileges. Bravo agent installation skipped."
      );
      return;
    }

    // CodeBuild containers run as root without a sudo binary; other
    // providers keep the existing sudo-based install.
    const useDirectPrivileges = provider === "codebuild" && privilegeMode === "root";

    cp.execSync(useDirectPrivileges ? "mkdir -p /home/agent" : "sudo mkdir -p /home/agent");
    chownForFolder(getRunnerUser(), "/home/agent", useDirectPrivileges);

    await installAgentBravo(bravoConfigStr, useDirectPrivileges);
  } catch (error) {
    console.log(`Failed to install bravo agent: ${error.message}`);
  }
}
