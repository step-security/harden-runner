import * as cp from "child_process";
import { sleep } from "./setup";

export async function isArcRunner(): Promise<boolean> {
  let out: boolean = false;

  let runner_user_agent: string =
    process.env["GITHUB_ACTIONS_RUNNER_EXTRA_USER_AGENT"];

  if (runner_user_agent.indexOf("actions-runner-controller/") > -1) out = true;
  return out;
}

export async function sendAllowedEndpoints(endpoints: string) {
  let allowed_endpoints = endpoints.split(" "); // endpoints are space separated
  if (allowed_endpoints.length > 0) {
    for (let endp of allowed_endpoints) {
      cp.execSync(
        `echo "${endp}" > "step_policy_endpoint_\`echo "${endp}" | base64\`"`
      );
    }
    applyPolicy(allowed_endpoints.length);
  }

  // Waiting for policy to get applied.
  let counter = 0;
  while (true) {
      counter++;
      if (counter > 10) {
        break;
      }
      await sleep(300);
    }
}

function applyPolicy(count: Number) {
  cp.execSync(
    `echo "step_policy_apply_${count}" > "step_policy_apply_${count}"`
  );
}

export function removeStepPolicyFiles() {
  cp.execSync("rm step_policy_*");
}

export function arcCleanUp() {
  // send a signal to backend harden-runner for initiating cleanup
  cp.execSync(`echo "cleanup" > "step_policy_cleanup"`);
}
