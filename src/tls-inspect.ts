import { STEPSECURITY_API_URL } from "./configs";
import * as core from "@actions/core";
import { getGHESInputs, isGHES } from "./common";

export async function isTLSEnabled(owner: string): Promise<boolean> {
  let tlsStatusOwner = owner;
  if (isGHES()) {
    const inputs = getGHESInputs();
    if (!inputs) {
      return false;
    }

    tlsStatusOwner = `${inputs.customer}::${inputs.server_name}::${owner}`;
  }

  const tlsStatusEndpoint = `${STEPSECURITY_API_URL}/github/${tlsStatusOwner}/actions/tls-inspection-status`;

  core.info(`[!] Checking TLS_STATUS: ${owner}`);
  try {
    const resp = await fetch(tlsStatusEndpoint, {
      signal: AbortSignal.timeout(3000),
    });
    if (resp.status === 200) {
      core.info(`[!] TLS_ENABLED: ${owner}`);
      return true;
    }
    // The API answers 403 when TLS inspection is not enabled. Any other
    // status (429, 5xx, ...) means the API could not answer, not "disabled".
    if (resp.status === 403) {
      core.info(`[!] TLS_NOT_ENABLED: ${owner}`);
      return false;
    }
    core.info(
      `[!] TLS_STATUS returned ${resp.status}. Defaulting to TLS enabled.`
    );
    return true;
  } catch (e) {
    core.info(`[!] Unable to check TLS_STATUS. Defaulting to TLS enabled.`);
    return true;
  }
}

export function isGithubHosted() {
  const runnerEnvironment = process.env.RUNNER_ENVIRONMENT || "";
  return runnerEnvironment === "github-hosted";
}
