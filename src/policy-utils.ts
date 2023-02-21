import { HttpClient } from "@actions/http-client";
import { PolicyResponse, Configuration } from "./interfaces";

export const API_ENDPOINT = "https://agent.api.stepsecurity.io/v1";

export async function fetchPolicy(
  owner: string,
  policyName: string
): Promise<PolicyResponse> {
  let policyEndpoint = `${API_ENDPOINT}/github/${owner}/actions/policies/${policyName}`;

  let httpClient = new HttpClient();
  let response = await httpClient.getJson<PolicyResponse>(policyEndpoint);
  if (response.statusCode !== 200) {
    // policy doesn't exists
    switch (response.statusCode) {
      case 400:
        throw new Error("error: policy doesn't exists");
      case 401:
        throw new Error("error: unauthorized");
    }
  }
  return response.result;
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

  if (remoteConfig.disable_file_monitoring !== undefined) {
    localConfig.disable_file_monitoring = remoteConfig.disable_file_monitoring;
  }
  if (remoteConfig.egress_policy !== undefined) {
    localConfig.egress_policy = remoteConfig.egress_policy;
  }

  return localConfig;
}
