import * as cp from "child_process";
import * as fs from "fs";
import path from "path";

export function isARCRunner(): boolean {
  const runnerUserAgent = process.env["GITHUB_ACTIONS_RUNNER_EXTRA_USER_AGENT"];

  let isARC = false;

  if (!runnerUserAgent) {
    isARC = false;
  } else {
    isARC = runnerUserAgent.includes("actions-runner-controller/");
  }

  return isARC || isSecondaryPod();
}

function isSecondaryPod(): boolean {
  const workDir = "/__w";
  let hasKubeEnv = process.env["KUBERNETES_PORT"] !== undefined;
  return fs.existsSync(workDir) && hasKubeEnv;
}

export function sendAllowedEndpoints(endpoints: string): void {
  const startTime = Date.now();
  const allowedEndpoints = endpoints.split(" "); // endpoints are space separated

  let sent = 0;
  for (let endpoint of allowedEndpoints) {
    endpoint = endpoint.trim();
    if (endpoint.length > 0) {
      let encodedEndpoint = Buffer.from(endpoint).toString("base64");
      let endpointPolicyStr = `step_policy_endpoint_${encodedEndpoint}`;
      echo(endpointPolicyStr);
      sent++;
    }
  }

  if (sent > 0) {
    applyPolicy(sent);
  }

  const duration = Date.now() - startTime;
  console.log(
    `[harden-runner] sendAllowedEndpoints completed in ${duration}ms (sent ${sent} endpoints)`
  );
}

function applyPolicy(count: number): void {
  let applyPolicyStr = `step_policy_apply_${count}`;
  echo(applyPolicyStr);
}

function echo(content: string) {
  cp.execFileSync("echo", [content]);
}
