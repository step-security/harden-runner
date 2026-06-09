import { STEPSECURITY_API_URL } from "./configs";
import * as core from "@actions/core";

export async function isTLSEnabled(owner: string): Promise<boolean> {
  const tlsStatusEndpoint = `${STEPSECURITY_API_URL}/github/${owner}/actions/tls-inspection-status`;
  core.info(`[!] Checking TLS_STATUS: ${owner}`);
  try {
    const resp = await fetch(tlsStatusEndpoint, {
      signal: AbortSignal.timeout(3000),
    });
    if (resp.status === 200) {
      core.info(`[!] TLS_ENABLED: ${owner}`);
      return true;
    }
    core.info(`[!] TLS_NOT_ENABLED: ${owner}`);
    return false;
  } catch (e) {
    core.info(`[!] Unable to check TLS_STATUS`);
    return false;
  }
}

export function isGithubHosted() {
  const runnerEnvironment = process.env.RUNNER_ENVIRONMENT || "";
  return runnerEnvironment === "github-hosted";
}
