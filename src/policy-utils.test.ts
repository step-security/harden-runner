import { fetchPolicy, fetchPolicyFromStore, mergeConfigs } from "./policy-utils";
import { Configuration, PolicyResponse } from "./interfaces";
import { STEPSECURITY_API_URL } from "./configs";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

type FetchImpl = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

function mockFetch(impl: FetchImpl) {
  globalThis.fetch = impl as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Mock fetch with a sequence of responses or errors. Each call consumes one entry.
function mockFetchSequence(entries: Array<Response | Error>) {
  let i = 0;
  mockFetch(async () => {
    const entry = entries[i++];
    if (!entry) throw new Error("fetch called more times than expected");
    if (entry instanceof Error) throw entry;
    return entry;
  });
}

// ==================== fetchPolicy ====================

test("success: fetching policy", async () => {
  const owner = "h0x0er";
  const policyName = "policy1";
  const response = {
    owner: "h0x0er",
    policyName: "policy1",
    allowed_endpoints: ["github.com:443"],
    egress_policy: "audit",
    disable_telemetry: false,
    disable_sudo: false,
    disable_file_monitoring: false,
  };

  const expectedUrl = `${STEPSECURITY_API_URL}/github/${owner}/actions/policies/${policyName}`;
  mockFetch(async (url, init) => {
    expect(String(url)).toBe(expectedUrl);
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer xyz");
    expect((init?.headers as Record<string, string>)["Source"]).toBe("github-actions");
    return jsonResponse(200, response);
  });

  const policy = await fetchPolicy(owner, policyName, "xyz");
  expect(policy).toEqual(response);
});

test("fetchPolicy throws when idToken is empty", async () => {
  await expect(fetchPolicy("owner", "policy1", "")).rejects.toThrow(
    "[PolicyFetch]: id-token in empty"
  );
});

test("fetchPolicy retries on failure and succeeds", async () => {
  const response = {
    allowed_endpoints: ["example.com:443"],
    egress_policy: "block",
  };

  mockFetchSequence([
    new TypeError("fetch failed"),
    jsonResponse(200, response),
  ]);

  const policy = await fetchPolicy("test-owner", "test-policy", "token123");
  expect(policy).toEqual(response);
});

test("fetchPolicy throws after all retries exhausted", async () => {
  mockFetchSequence([
    new TypeError("fetch failed"),
    new TypeError("fetch failed"),
    new TypeError("fetch failed"),
  ]);

  await expect(
    fetchPolicy("test-owner", "test-policy", "token123")
  ).rejects.toThrow("[Policy Fetch]");
});

test("fetchPolicy preserves statusCode from error", async () => {
  // server returns 404 on every retry; the HttpStatusError raised internally
  // carries statusCode=404 which the outer error should expose.
  mockFetchSequence([
    jsonResponse(404, { message: "not found" }),
    jsonResponse(404, { message: "not found" }),
    jsonResponse(404, { message: "not found" }),
  ]);

  try {
    await fetchPolicy("test-owner", "test-policy", "token123");
    fail("should have thrown");
  } catch (err: any) {
    expect(err.message).toContain("[Policy Fetch]");
    expect(err.statusCode).toBe(404);
  }
});

// ==================== fetchPolicyFromStore ====================

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

  mockFetch(async () => jsonResponse(200, response));

  const result = await fetchPolicyFromStore(owner, repo, "my-api-key", workflow, runId, correlationId);
  expect(result).toEqual(response);
});

test("fetchPolicyFromStore throws when apiKey is empty", async () => {
  await expect(
    fetchPolicyFromStore("owner", "repo", "", "ci.yml", "123", "abc")
  ).rejects.toThrow("[PolicyStoreFetch]: api-key is empty");
});

test("fetchPolicyFromStore returns null when policy not found (404)", async () => {
  mockFetch(async () => jsonResponse(404, { message: "not found" }));

  const result = await fetchPolicyFromStore("test-owner", "test-repo", "my-api-key", "ci.yml", "12345", "abc-def");
  expect(result).toBeNull();
});

test("fetchPolicyFromStore returns null when API returns empty policy", async () => {
  mockFetch(async () => jsonResponse(200, { allowed_endpoints: [], egress_policy: "", policy_name: "" }));

  const result = await fetchPolicyFromStore("test-owner", "nonexistent-repo", "my-api-key", "ci.yml", "12345", "abc-def");
  expect(result).toBeNull();
});

test("fetchPolicyFromStore retries on failure and succeeds", async () => {
  const response = {
    allowed_endpoints: ["example.com:443"],
    egress_policy: "audit",
  };

  mockFetchSequence([
    new TypeError("fetch failed"),
    jsonResponse(200, response),
  ]);

  const result = await fetchPolicyFromStore("test-owner", "test-repo", "my-api-key", "ci.yml", "12345", "abc-def");
  expect(result).toEqual(response);
});

test("fetchPolicyFromStore throws after all retries exhausted", async () => {
  mockFetchSequence([
    new TypeError("fetch failed"),
    new TypeError("fetch failed"),
    new TypeError("fetch failed"),
  ]);

  await expect(
    fetchPolicyFromStore("test-owner", "test-repo", "my-api-key", "ci.yml", "12345", "abc-def")
  ).rejects.toThrow("[Policy Store Fetch]");
});

test("fetchPolicyFromStore preserves statusCode from error", async () => {
  mockFetchSequence([
    jsonResponse(401, { message: "Unauthorized" }),
    jsonResponse(401, { message: "Unauthorized" }),
    jsonResponse(401, { message: "Unauthorized" }),
  ]);

  try {
    await fetchPolicyFromStore("test-owner", "test-repo", "my-api-key", "ci.yml", "12345", "abc-def");
    fail("should have thrown");
  } catch (err: any) {
    expect(err.message).toContain("[Policy Store Fetch]");
    expect(err.statusCode).toBe(401);
  }
});

test("fetchPolicyFromStore sends correct authorization header", async () => {
  const apiKey = "secret-key-123";

  mockFetch(async (_url, init) => {
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`vm-api-key ${apiKey}`);
    expect(headers["Source"]).toBe("github-actions");
    return jsonResponse(200, { allowed_endpoints: [], egress_policy: "audit" });
  });

  const result = await fetchPolicyFromStore("test-owner", "test-repo", apiKey, "ci.yml", "12345", "abc-def");
  expect(result).toEqual({ allowed_endpoints: [], egress_policy: "audit" });
});

test("fetchPolicyFromStore returns within ~3s when server is slow (regression test for AggregateError)", async () => {
  mockFetch((_url, init) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError"))
        );
      }
    });
  });

  const start = Date.now();
  await expect(
    fetchPolicyFromStore("test-owner", "test-repo", "my-api-key", "ci.yml", "12345", "abc-def")
  ).rejects.toThrow("[Policy Store Fetch]");
  const elapsed = Date.now() - start;
  // 3 retries × (3s timeout + 1s sleep), but last sleep is unnecessary.
  // Bounded by 3 * 3s + 2 * 1s = 11s. Test passes if it doesn't hang for minutes.
  expect(elapsed).toBeLessThan(13_000);
}, 20_000);

// ==================== mergeConfigs ====================

test("merge configs", async () => {
  let localConfig: Configuration = {
    repo: "test/repo",
    run_id: "xyx",
    correlation_id: "aaaaa",
    working_directory: "/xyz",
    api_url: "xyz",
    telemetry_url: "xyz",
    allowed_endpoints: "",
    denied_endpoints: "",
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
  const policyResponse: PolicyResponse = {
    owner: "h0x0er",
    policyName: "policy1",
    allowed_endpoints: ["github.com:443", "google.com:443"],
    denied_endpoints: ["bad.example.com:443", "evil.example.com:443"],
    egress_policy: "audit",
    disable_telemetry: false,
    disable_sudo: false,
    disable_file_monitoring: false,
  };
  const expectedConfiguration: Configuration = {
    repo: "test/repo",
    run_id: "xyx",
    correlation_id: "aaaaa",
    working_directory: "/xyz",
    api_url: "xyz",
    telemetry_url: "xyz",
    allowed_endpoints: "github.com:443 google.com:443",
    denied_endpoints: "bad.example.com:443 evil.example.com:443",
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

test("mergeConfigs does not override local allowed_endpoints if not empty", () => {
  let localConfig: Configuration = {
    repo: "test/repo",
    run_id: "xyx",
    correlation_id: "aaaaa",
    working_directory: "/xyz",
    api_url: "xyz",
    telemetry_url: "xyz",
    allowed_endpoints: "local.endpoint:443",
    denied_endpoints: "local-denied.endpoint:443",
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
  const policyResponse: PolicyResponse = {
    allowed_endpoints: ["remote.endpoint:443"],
    denied_endpoints: ["remote-denied.endpoint:443"],
    egress_policy: "block",
  };

  localConfig = mergeConfigs(localConfig, policyResponse);
  expect(localConfig.allowed_endpoints).toBe("local.endpoint:443");
  expect(localConfig.denied_endpoints).toBe("local-denied.endpoint:443");
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
    denied_endpoints: "",
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
  const policyResponse: PolicyResponse = {
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
    denied_endpoints: "",
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
  const policyResponse: PolicyResponse = {
    allowed_endpoints: [],
  };

  localConfig = mergeConfigs(localConfig, policyResponse);
  expect(localConfig.disable_sudo).toBe(true);
  expect(localConfig.disable_sudo_and_containers).toBe(true);
  expect(localConfig.disable_file_monitoring).toBe(true);
  expect(localConfig.egress_policy).toBe("block");
  expect(localConfig.denied_endpoints).toBe("");
});

test("mergeConfigs handles remote policy without endpoint lists", () => {
  let localConfig: Configuration = {
    repo: "test/repo",
    run_id: "xyx",
    correlation_id: "aaaaa",
    working_directory: "/xyz",
    api_url: "xyz",
    telemetry_url: "xyz",
    allowed_endpoints: "",
    denied_endpoints: "",
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
  const policyResponse: PolicyResponse = {};

  localConfig = mergeConfigs(localConfig, policyResponse);
  expect(localConfig.allowed_endpoints).toBe("");
  expect(localConfig.denied_endpoints).toBe("");
});
