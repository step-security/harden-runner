import nock from "nock";
import { fetchPolicy, mergeConfigs } from "./policy-utils";
import { Configuration, PolicyResponse } from "./interfaces";
import { STEPSECURITY_API_URL } from "./configs";

test("success: fetching policy", async () => {
  let owner = "h0x0er";
  let policyName = "policy1";
  let response = {
    owner: "h0x0er",
    policyName: "policy1",
    allowed_endpoints: ["github.com:443"],
    egress_policy: "audit",
    disable_telemetry: false,
    disable_sudo: false,
    disable_file_monitoring: false,
  };
  const policyScope = nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/actions/policies/${policyName}`)
    .reply(200, response);

  let idToken = "xyz";
  let policy = await fetchPolicy(owner, policyName, idToken);
  console.log(policy);
  expect(policy).toStrictEqual(response);
});

test("merge configs", async () => {
  let localConfig: Configuration = {
    repo: "test/repo",
    run_id: "xyx",
    correlation_id: "aaaaa",
    working_directory: "/xyz",
    api_url: "xyz",
    telemetry_url: "xyz",
    allowed_endpoints: "",
    egress_policy: "audit",
    disable_telemetry: false,
    disable_sudo: false,
    disable_sudo_and_containers: false,
    disable_file_monitoring: false,
    private: "true",
    is_github_hosted: true,
    is_debug: false,
    one_time_key: "",
    api_key: "",
    use_policy_store: false,
    deploy_on_self_hosted_vm: false,
  };
  let policyResponse: PolicyResponse = {
    owner: "h0x0er",
    policyName: "policy1",
    allowed_endpoints: ["github.com:443", "google.com:443"],
    egress_policy: "audit",
    disable_telemetry: false,
    disable_sudo: false,
    disable_file_monitoring: false,
  };

  let expectedConfiguration: Configuration = {
    repo: "test/repo",
    run_id: "xyx",
    correlation_id: "aaaaa",
    working_directory: "/xyz",
    api_url: "xyz",
    telemetry_url: "xyz",
    allowed_endpoints: "github.com:443 google.com:443",
    egress_policy: "audit",
    disable_telemetry: false,
    disable_sudo: false,
    disable_sudo_and_containers: false,
    disable_file_monitoring: false,
    private: "true",
    is_github_hosted: true,
    is_debug: false,
    one_time_key: "",
    api_key: "",
    use_policy_store: false,
    deploy_on_self_hosted_vm: false,
  };

  localConfig = mergeConfigs(localConfig, policyResponse);
  expect(localConfig).toStrictEqual(expectedConfiguration);
});

// ==================== additional fetchPolicy tests ====================

test("fetchPolicy throws when idToken is empty", async () => {
  await expect(fetchPolicy("owner", "policy1", "")).rejects.toThrow(
    "[PolicyFetch]: id-token in empty"
  );
});

test("fetchPolicy retries on failure and succeeds", async () => {
  const owner = "test-owner";
  const policyName = "test-policy";
  const response = {
    allowed_endpoints: ["example.com:443"],
    egress_policy: "block",
  };

  nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/actions/policies/${policyName}`)
    .replyWithError("connection timeout");
  nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/actions/policies/${policyName}`)
    .reply(200, response);

  const policy = await fetchPolicy(owner, policyName, "token123");
  expect(policy).toStrictEqual(response);
});

test("fetchPolicy throws after all retries exhausted", async () => {
  const owner = "test-owner";
  const policyName = "test-policy";

  nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/actions/policies/${policyName}`)
    .times(3)
    .replyWithError("connection timeout");

  await expect(
    fetchPolicy(owner, policyName, "token123")
  ).rejects.toThrow("[Policy Fetch]");
});

test("fetchPolicy preserves statusCode from error", async () => {
  const owner = "test-owner";
  const policyName = "test-policy";

  const errorWithStatus = new Error("Not Found");
  (errorWithStatus as any).statusCode = 404;

  nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/actions/policies/${policyName}`)
    .times(3)
    .replyWithError(errorWithStatus);

  try {
    await fetchPolicy(owner, policyName, "token123");
    fail("should have thrown");
  } catch (err) {
    expect(err.message).toContain("[Policy Fetch]");
  }
});

// ==================== fetchPolicyFromStore ====================

import { fetchPolicyFromStore } from "./policy-utils";

const policyStoreQueryString = (workflow: string, runId: string, correlationId: string) =>
  `workflow=${encodeURIComponent(workflow)}&run_id=${encodeURIComponent(runId)}&correlationId=${encodeURIComponent(correlationId)}`;

test("success: fetches policy from store", async () => {
  const owner = "test-owner";
  const repo = "test-repo";
  const workflow = "ci.yml";
  const runId = "12345";
  const correlationId = "abc-def";
  const response = {
    allowed_endpoints: ["registry.npmjs.org:443", "github.com:443"],
    egress_policy: "block",
    disable_sudo: true,
    disable_file_monitoring: false,
  };

  nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/${repo}/actions/policies/workflow-policy?${policyStoreQueryString(workflow, runId, correlationId)}`)
    .reply(200, response);

  const result = await fetchPolicyFromStore(owner, repo, "my-api-key", workflow, runId, correlationId);
  expect(result).toStrictEqual(response);
});

test("fetchPolicyFromStore throws when apiKey is empty", async () => {
  await expect(
    fetchPolicyFromStore("owner", "repo", "", "ci.yml", "123", "abc")
  ).rejects.toThrow("[PolicyStoreFetch]: api-key is empty");
});

test("fetchPolicyFromStore returns null when policy not found (404)", async () => {
  const owner = "test-owner";
  const repo = "test-repo";
  const workflow = "ci.yml";
  const runId = "12345";
  const correlationId = "abc-def";

  nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/${repo}/actions/policies/workflow-policy?${policyStoreQueryString(workflow, runId, correlationId)}`)
    .reply(404, { message: "not found" });

  const result = await fetchPolicyFromStore(owner, repo, "my-api-key", workflow, runId, correlationId);
  expect(result).toBeNull();
});

test("fetchPolicyFromStore returns null when API returns empty policy", async () => {
  const owner = "test-owner";
  const repo = "nonexistent-repo";
  const workflow = "ci.yml";
  const runId = "12345";
  const correlationId = "abc-def";

  nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/${repo}/actions/policies/workflow-policy?${policyStoreQueryString(workflow, runId, correlationId)}`)
    .reply(200, { allowed_endpoints: [], egress_policy: "", policy_name: "" });

  const result = await fetchPolicyFromStore(owner, repo, "my-api-key", workflow, runId, correlationId);
  expect(result).toBeNull();
});

test("fetchPolicyFromStore retries on failure and succeeds", async () => {
  const owner = "test-owner";
  const repo = "test-repo";
  const workflow = "ci.yml";
  const runId = "12345";
  const correlationId = "abc-def";
  const response = {
    allowed_endpoints: ["example.com:443"],
    egress_policy: "audit",
  };

  nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/${repo}/actions/policies/workflow-policy?${policyStoreQueryString(workflow, runId, correlationId)}`)
    .replyWithError("timeout");
  nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/${repo}/actions/policies/workflow-policy?${policyStoreQueryString(workflow, runId, correlationId)}`)
    .reply(200, response);

  const result = await fetchPolicyFromStore(owner, repo, "my-api-key", workflow, runId, correlationId);
  expect(result).toStrictEqual(response);
});

test("fetchPolicyFromStore throws after all retries exhausted", async () => {
  const owner = "test-owner";
  const repo = "test-repo";
  const workflow = "ci.yml";
  const runId = "12345";
  const correlationId = "abc-def";

  nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/${repo}/actions/policies/workflow-policy?${policyStoreQueryString(workflow, runId, correlationId)}`)
    .times(3)
    .replyWithError("connection refused");

  await expect(
    fetchPolicyFromStore(owner, repo, "my-api-key", workflow, runId, correlationId)
  ).rejects.toThrow("[Policy Store Fetch]");
});

test("fetchPolicyFromStore preserves statusCode from error", async () => {
  const owner = "test-owner";
  const repo = "test-repo";
  const workflow = "ci.yml";
  const runId = "12345";
  const correlationId = "abc-def";

  const errorWithStatus = new Error("Unauthorized");
  (errorWithStatus as any).statusCode = 401;

  nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/${repo}/actions/policies/workflow-policy?${policyStoreQueryString(workflow, runId, correlationId)}`)
    .times(3)
    .replyWithError(errorWithStatus);

  try {
    await fetchPolicyFromStore(owner, repo, "my-api-key", workflow, runId, correlationId);
    fail("should have thrown");
  } catch (err) {
    expect(err.message).toContain("[Policy Store Fetch]");
  }
});

test("fetchPolicyFromStore sends correct authorization header", async () => {
  const owner = "test-owner";
  const repo = "test-repo";
  const apiKey = "secret-key-123";
  const workflow = "ci.yml";
  const runId = "12345";
  const correlationId = "abc-def";

  nock(`${STEPSECURITY_API_URL}`, {
    reqheaders: {
      Authorization: `vm-api-key ${apiKey}`,
      Source: "github-actions",
    },
  })
    .get(`/github/${owner}/${repo}/actions/policies/workflow-policy?${policyStoreQueryString(workflow, runId, correlationId)}`)
    .reply(200, { allowed_endpoints: [], egress_policy: "audit" });

  const result = await fetchPolicyFromStore(owner, repo, apiKey, workflow, runId, correlationId);
  expect(result).toStrictEqual({
    allowed_endpoints: [],
    egress_policy: "audit",
  });
});

// ==================== additional mergeConfigs tests ====================

test("mergeConfigs does not override local allowed_endpoints if not empty", () => {
  let localConfig: Configuration = {
    repo: "test/repo",
    run_id: "xyx",
    correlation_id: "aaaaa",
    working_directory: "/xyz",
    api_url: "xyz",
    telemetry_url: "xyz",
    allowed_endpoints: "local.endpoint:443",
    egress_policy: "audit",
    disable_telemetry: false,
    disable_sudo: false,
    disable_sudo_and_containers: false,
    disable_file_monitoring: false,
    private: "true",
    is_github_hosted: true,
    is_debug: false,
    one_time_key: "",
    api_key: "",
    use_policy_store: false,
    deploy_on_self_hosted_vm: false,
  };
  let policyResponse: PolicyResponse = {
    allowed_endpoints: ["remote.endpoint:443"],
    egress_policy: "block",
  };

  localConfig = mergeConfigs(localConfig, policyResponse);
  expect(localConfig.allowed_endpoints).toBe("local.endpoint:443");
  expect(localConfig.egress_policy).toBe("block");
});

test("mergeConfigs overrides disable_sudo_and_containers from remote", () => {
  let localConfig: Configuration = {
    repo: "test/repo",
    run_id: "xyx",
    correlation_id: "aaaaa",
    working_directory: "/xyz",
    api_url: "xyz",
    telemetry_url: "xyz",
    allowed_endpoints: "",
    egress_policy: "audit",
    disable_telemetry: false,
    disable_sudo: false,
    disable_sudo_and_containers: false,
    disable_file_monitoring: false,
    private: "true",
    is_github_hosted: true,
    is_debug: false,
    one_time_key: "",
    api_key: "",
    use_policy_store: false,
    deploy_on_self_hosted_vm: false,
  };
  let policyResponse: PolicyResponse = {
    allowed_endpoints: [],
    disable_sudo_and_containers: true,
  };

  localConfig = mergeConfigs(localConfig, policyResponse);
  expect(localConfig.disable_sudo_and_containers).toBe(true);
});

test("mergeConfigs does not override fields when remote values are undefined", () => {
  let localConfig: Configuration = {
    repo: "test/repo",
    run_id: "xyx",
    correlation_id: "aaaaa",
    working_directory: "/xyz",
    api_url: "xyz",
    telemetry_url: "xyz",
    allowed_endpoints: "",
    egress_policy: "block",
    disable_telemetry: false,
    disable_sudo: true,
    disable_sudo_and_containers: true,
    disable_file_monitoring: true,
    private: "true",
    is_github_hosted: true,
    is_debug: false,
    one_time_key: "",
    api_key: "",
    use_policy_store: false,
    deploy_on_self_hosted_vm: false,
  };
  let policyResponse: PolicyResponse = {
    allowed_endpoints: [],
  };

  localConfig = mergeConfigs(localConfig, policyResponse);
  expect(localConfig.disable_sudo).toBe(true);
  expect(localConfig.disable_sudo_and_containers).toBe(true);
  expect(localConfig.disable_file_monitoring).toBe(true);
  expect(localConfig.egress_policy).toBe("block");
});
