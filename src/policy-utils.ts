import { HttpClient } from "@actions/http-client";
import { PolicyResponse, Configuration } from "./interfaces";
import { STEPSECURITY_API_URL } from "./configs";

export async function fetchPolicy(
  owner: string,
  policyName: string,
  idToken: string
): Promise<PolicyResponse> {
  if (idToken === "") {
    throw new Error("[PolicyFetch]: id-token in empty");
  }

  let policyEndpoint = `${STEPSECURITY_API_URL}/github/${owner}/actions/policies/${policyName}`;

  let httpClient = new HttpClient();

  let headers = {};
  headers["Authorization"] = `Bearer ${idToken}`;
  headers["Source"] = "github-actions";

  let response = undefined;
  let err = undefined;

  let retry = 0;
  while (retry < 3) {
    try {
      console.log(`Attempt: ${retry + 1}`);
      response = await httpClient.getJson<PolicyResponse>(
        policyEndpoint,
        headers
      );
      break;
    } catch (e) {
      err = e;
    }
    retry += 1;
    await sleep(1000);
  }

  if (response === undefined && err !== undefined) {
    // Preserve the original error's statusCode if it exists
    const error = new Error(`[Policy Fetch] ${err}`);
    if (err.statusCode !== undefined) {
      (error as any).statusCode = err.statusCode;
    }
    throw error;
  } else {
    return response.result;
  }
}

export async function fetchPolicyFromStore(
  owner: string,
  repo: string,
  apiKey: string,
  workflow: string,
  runId: string,
  correlationId: string
): Promise<PolicyResponse | null> {
  if (apiKey === "") {
    throw new Error("[PolicyStoreFetch]: api-key is empty");
  }

  let policyEndpoint = `${STEPSECURITY_API_URL}/github/${owner}/${repo}/actions/policies/workflow-policy?workflow=${encodeURIComponent(workflow)}&run_id=${encodeURIComponent(runId)}&correlationId=${encodeURIComponent(correlationId)}`;

  let httpClient = new HttpClient();

  let headers = {};
  headers["Authorization"] = `vm-api-key ${apiKey}`;
  headers["Source"] = "github-actions";

  let response = undefined;
  let err = undefined;

  let retry = 0;
  while (retry < 3) {
    try {
      console.log(`Attempt: ${retry + 1}`);
      response = await httpClient.getJson<PolicyResponse>(
        policyEndpoint,
        headers
      );
      break;
    } catch (e) {
      err = e;
    }
    retry += 1;
    await sleep(1000);
  }

  if (response === undefined && err !== undefined) {
    const error = new Error(`[Policy Store Fetch] ${err}`);
    if (err.statusCode !== undefined) {
      (error as any).statusCode = err.statusCode;
    }
    throw error;
  }

  if (response.statusCode === 404) {
    return null;
  }

  const result = response.result;
  if (!result || (!result.egress_policy && (!result.allowed_endpoints || result.allowed_endpoints.length === 0))) {
    return null;
  }

  return result;
}

export function mergeConfigs(
  localConfig: Configuration,
  remoteConfig: PolicyResponse
) {
  if (localConfig.allowed_endpoints === "") {
    localConfig.allowed_endpoints = remoteConfig.allowed_endpoints.join(" ");
  }
  if (remoteConfig.disable_sudo !== undefined) {
    localConfig.disable_sudo = remoteConfig.disable_sudo;
  }

  if (remoteConfig.disable_sudo_and_containers !== undefined) {
    localConfig.disable_sudo_and_containers = remoteConfig.disable_sudo_and_containers;
  }

  if (remoteConfig.disable_file_monitoring !== undefined) {
    localConfig.disable_file_monitoring = remoteConfig.disable_file_monitoring;
  }
  if (remoteConfig.egress_policy !== undefined) {
    localConfig.egress_policy = remoteConfig.egress_policy;
  }

  return localConfig;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
