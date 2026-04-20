import { Configuration } from "./interfaces";

export function buildBravoConfig(confg: Configuration) {
  return {
    repo: confg.repo,
    run_id: confg.run_id,
    correlation_id: confg.correlation_id,
    working_directory: confg.working_directory,
    api_url: confg.api_url,
    telemetry_url: confg.telemetry_url,
    one_time_key: confg.one_time_key,
    allowed_endpoints: confg.allowed_endpoints,
    egress_policy: confg.egress_policy,
    disable_telemetry: confg.disable_telemetry,
    disable_sudo: confg.disable_sudo,
    disable_sudo_and_containers: confg.disable_sudo_and_containers,
    disable_file_monitoring: confg.disable_file_monitoring,
    private: confg.private,
    is_github_hosted: true,
  };
}
