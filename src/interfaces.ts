export interface Configuration {
  repo: string;
  run_id: string;
  correlation_id: string;
  working_directory: string;
  api_url: string;
  telemetry_url: string;
  allowed_endpoints: string;
  egress_policy: string;
  disable_telemetry: boolean;
  disable_sudo: boolean;
  disable_sudo_and_containers: boolean;
  disable_file_monitoring: boolean;
  is_github_hosted: boolean;
  private: string;
  is_debug: boolean;
  one_time_key: string;
  api_key: string;
  use_policy_store: boolean;
  deploy_on_self_hosted_vm: boolean;
}

export interface PolicyResponse {
  owner?: string;
  policyName?: string;
  allowed_endpoints?: string[];
  disable_sudo?: boolean;
  disable_sudo_and_containers?: boolean;
  disable_file_monitoring?: boolean;
  disable_telemetry?: boolean;
  egress_policy?: string;
  policy_name?: string;
}
