import { STEPSECURITY_API_URL } from "./configs";
import * as core from "@actions/core";
import { getQualifiedOwner } from "./common";

export async function isTLSEnabled(owner: string): Promise<boolean> {
  const tlsStatusOwner = getQualifiedOwner(owner);
  if (!tlsStatusOwner) {
    return false;
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
    core.info(`[!] TLS_NOT_ENABLED: ${owner}`);
    return false;
  } catch (e) {
    core.info(`[!] Unable to check TLS_STATUS. Defaulting to TLS enabled.`);
    return true;
  }
}

export function isGithubHosted() {
  const runnerEnvironment = process.env.RUNNER_ENVIRONMENT || "";
  return runnerEnvironment === "github-hosted";
}
