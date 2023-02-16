import { HttpClient } from "@actions/http-client";
import { PolicyResponse } from "./interfaces";

export const apiEndpoint = "https://agent.api.stepsecurity.io/v1";

export async function fetchPolicy(
  owner: string,
  policyName: string
): Promise<PolicyResponse> {
  let policyEndpoint = `${apiEndpoint}/github/${owner}/actions/policies/${policyName}`;

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
