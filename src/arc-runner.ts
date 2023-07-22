import * as cp from "child_process";
import { sleep } from "./setup";

export function isArcRunner(): boolean {
  const runnerUserAgent = process.env["GITHUB_ACTIONS_RUNNER_EXTRA_USER_AGENT"];

  if (!runnerUserAgent) {
    return false;
  }

  return runnerUserAgent.includes("actions-runner-controller/");
}

function getRunnerTempDir(): string {
  const isTest = process.env["isTest"];

  if (isTest === "1") {
    return "/tmp";
  }

  return process.env["RUNNER_TEMP"] || "/tmp";
}

export function sendAllowedEndpoints(endpoints: string): void {
  const allowedEndpoints = endpoints.split(" "); // endpoints are space separated

  for (const endpoint of allowedEndpoints) {
    if (endpoint) {
      const encodedEndpoint = Buffer.from(endpoint).toString("base64");
      cp.execSync(
        `echo "${endpoint}" > "${getRunnerTempDir()}/step_policy_endpoint_${encodedEndpoint}"`
      );
    }
  }

  if (allowedEndpoints.length > 0) {
    applyPolicy(allowedEndpoints.length);
  }
}

function applyPolicy(count: number): void {
  const fileName = `step_policy_apply_${count}`;
  cp.execSync(`echo "${fileName}" > "${getRunnerTempDir()}/${fileName}"`);
}

export function removeStepPolicyFiles() {
  cp.execSync(`rm ${getRunnerTempDir()}/step_policy_*`);
}

export function arcCleanUp() {
  cp.execSync(`echo "cleanup" > "${getRunnerTempDir()}/step_policy_cleanup"`);
}
