import { PolicyResponse, Configuration } from "./interfaces";
import { STEPSECURITY_API_URL } from "./configs";

class HttpStatusError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function fetchPolicy(
  owner: string,
  policyName: string,
  idToken: string
): Promise<PolicyResponse> {
  if (idToken === "") {
    throw new Error("[PolicyFetch]: id-token in empty");
  }

  const policyEndpoint = `${STEPSECURITY_API_URL}/github/${owner}/actions/policies/${policyName}`;

  const headers = {
    Authorization: `Bearer ${idToken}`,
    Source: "github-actions",
  };

  let result: PolicyResponse | undefined;
  let err: unknown;

  for (let retry = 0; retry < 3; retry++) {
    try {
      console.log(`Attempt: ${retry + 1}`);
      result = await getJsonWithTimeout<PolicyResponse>(policyEndpoint, headers);
      break;
    } catch (e) {
      err = e;
      if (retry < 2) await sleep(1000);
    }
  }

  if (result === undefined) {
    const error = new Error(`[Policy Fetch] ${err}`);
    if (err && typeof err === "object" && "statusCode" in err) {
      (error as any).statusCode = (err as { statusCode: unknown }).statusCode;
    }
    throw error;
  }
  return result;
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

  const policyEndpoint = `${STEPSECURITY_API_URL}/github/${owner}/${repo}/actions/policies/workflow-policy?workflow=${encodeURIComponent(workflow)}&run_id=${encodeURIComponent(runId)}&correlationId=${encodeURIComponent(correlationId)}`;

  const headers = {
    Authorization: `vm-api-key ${apiKey}`,
    Source: "github-actions",
  };

  let result: PolicyResponse | undefined;
  let err: unknown;

  for (let retry = 0; retry < 3; retry++) {
    try {
      console.log(`Attempt: ${retry + 1}`);
      result = await getJsonWithTimeout<PolicyResponse>(policyEndpoint, headers);
      break;
    } catch (e) {
      // 404 means policy not found — don't retry, return null
      if (e instanceof HttpStatusError && e.statusCode === 404) {
        return null;
      }
      err = e;
      if (retry < 2) await sleep(1000);
    }
  }

  if (result === undefined) {
    const error = new Error(`[Policy Store Fetch] ${err}`);
    if (err && typeof err === "object" && "statusCode" in err) {
      (error as any).statusCode = (err as { statusCode: unknown }).statusCode;
    }
    throw error;
  }

  if (!result || (!result.egress_policy && (!result.allowed_endpoints || result.allowed_endpoints.length === 0))) {
    return null;
  }

  return result;
}

async function getJsonWithTimeout<T>(
  url: string,
  headers: Record<string, string>
): Promise<T> {
  const resp = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(3000),
  });
  if (!resp.ok) {
    throw new HttpStatusError(resp.status, `HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}

export function mergeConfigs(
  localConfig: Configuration,
  remoteConfig: PolicyResponse
) {
  const getEndpoints = (endpoints?: string[]) =>
    Array.isArray(endpoints) ? endpoints.join(" ") : "";

  if (localConfig.allowed_endpoints === "") {
    localConfig.allowed_endpoints = getEndpoints(remoteConfig.allowed_endpoints);
  }
  if (localConfig.denied_endpoints === "") {
    localConfig.denied_endpoints = getEndpoints(remoteConfig.denied_endpoints);
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
