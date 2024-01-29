import { HttpClient } from "@actions/http-client";
import { STEPSECURITY_API_URL } from "./configs";
import * as core from "@actions/core";

export async function isTLSEnabled(owner: string): Promise<boolean> {
  let tlsStatusEndpoint = `${STEPSECURITY_API_URL}/github/${owner}/actions/tls-inspection-status`;
  let httpClient = new HttpClient();
  core.info(`[!] Checking TLS_STATUS: ${owner}`);
  let isEnabled = false;
  try {
    let resp = await httpClient.get(tlsStatusEndpoint);
    if (resp.message.statusCode === 200) {
      isEnabled = true;
      core.info(`[!] TLS_ENABLED: ${owner}`);
    } else {
      core.info(`[!] TLS_NOT_ENABLED: ${owner}`);
    }
  } catch (e) {
    core.info(`[!] Unable to check TLS_STATUS`);
  }

  return isEnabled;
}

export function isGithubHosted() {
  const runnerName = process.env.RUNNER_NAME || "";
  return runnerName.startsWith("GitHub Actions");
}
