import { v4 as uuidv4 } from "uuid";
import { Configuration } from "./interfaces";

// ghesSelfHosted runs the agent in GHES self-hosted mode: with no monitor call
// there is no one-time key, so the agent registers its own runtime environment
// and uploads raw events through the customer-scoped self-hosted VM path.
export function buildBravoConfig(confg: Configuration, ghesSelfHosted = false) {
  return {
    repo: confg.repo,
    run_id: confg.run_id,
    correlation_id: confg.correlation_id,
    working_directory: confg.working_directory,
    api_url: confg.api_url,
    telemetry_url: confg.telemetry_url,
    one_time_key: confg.one_time_key,
    allowed_endpoints: confg.allowed_endpoints,
    denied_endpoints: confg.denied_endpoints,
    egress_policy: confg.egress_policy,
    disable_telemetry: confg.disable_telemetry,
    disable_sudo: confg.disable_sudo,
    disable_sudo_and_containers: confg.disable_sudo_and_containers,
    disable_file_monitoring: confg.disable_file_monitoring,
    private: confg.private,
    is_github_hosted: !ghesSelfHosted,
    ...(ghesSelfHosted && {
      customer: confg.customer,
      server_name: confg.server_name,
      is_ghes: true,
      is_persistent: false,
      api_key: uuidv4(),
    }),
  };
}
