import { buildBravoConfig } from "./bravo-config";
import { Configuration } from "./interfaces";

const base: Configuration = {
  repo: "org/repo",
  run_id: "123",
  correlation_id: "depot-abc",
  working_directory: "/w",
  api_url: "https://int.api.stepsecurity.io/v1",
  telemetry_url: "https://int.app-api.stepsecurity.io/v1",
  allowed_endpoints: "github.com:443",
  egress_policy: "audit",
  disable_telemetry: false,
  disable_sudo: false,
  disable_sudo_and_containers: false,
  disable_file_monitoring: false,
  is_github_hosted: false,
  private: "true" as unknown as string,
  is_debug: false,
  one_time_key: "otk-xyz",
  api_key: "tenant-key",
  use_policy_store: false,
  deploy_on_self_hosted_vm: false,
};

describe("buildBravoConfig", () => {
  test("forces is_github_hosted=true so agent honors passed correlation_id", () => {
    expect(buildBravoConfig(base).is_github_hosted).toBe(true);
  });

  test("omits api_key (agent authenticates via one_time_key, not vm-api-key)", () => {
    expect(buildBravoConfig(base)).not.toHaveProperty("api_key");
  });

  test("omits customer (server infers tenant from repo)", () => {
    expect(buildBravoConfig(base)).not.toHaveProperty("customer");
  });

  test("omits use_policy_store (action-side concern, not agent)", () => {
    expect(buildBravoConfig(base)).not.toHaveProperty("use_policy_store");
  });

  test("forwards telemetry_url so network events hit configured env", () => {
    expect(buildBravoConfig(base).telemetry_url).toBe(base.telemetry_url);
  });

  test("forwards one_time_key so agent can auth to presigned URL endpoint", () => {
    expect(buildBravoConfig(base).one_time_key).toBe("otk-xyz");
  });

  test("forwards repo, run_id, correlation_id so server can attribute events", () => {
    const cfg = buildBravoConfig(base);
    expect(cfg.repo).toBe("org/repo");
    expect(cfg.run_id).toBe("123");
    expect(cfg.correlation_id).toBe("depot-abc");
  });

  test("forwards private flag", () => {
    expect(buildBravoConfig(base).private).toBe(base.private);
  });

  test("forwards egress_policy and allowed_endpoints", () => {
    const cfg = buildBravoConfig(base);
    expect(cfg.egress_policy).toBe("audit");
    expect(cfg.allowed_endpoints).toBe("github.com:443");
  });

  test("forwards disable_* flags", () => {
    const cfg = buildBravoConfig({
      ...base,
      disable_telemetry: true,
      disable_sudo: true,
      disable_sudo_and_containers: true,
      disable_file_monitoring: true,
    });
    expect(cfg.disable_telemetry).toBe(true);
    expect(cfg.disable_sudo).toBe(true);
    expect(cfg.disable_sudo_and_containers).toBe(true);
    expect(cfg.disable_file_monitoring).toBe(true);
  });
});
