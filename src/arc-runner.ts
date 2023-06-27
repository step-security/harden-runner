import * as cp from "child_process";


export async function isArcRunner(): Promise<boolean> {
  let out: boolean = false;

  let runner_user_agent: string =
    process.env["GITHUB_ACTIONS_RUNNER_EXTRA_USER_AGENT"];
  
  console.log(`Runner Agent: ${runner_user_agent}`);

  if (runner_user_agent.indexOf("actions-runner-controller/") > -1) out = true;
  return out;
}

export function sendAllowedEndpoints(endpoints: string) {
  let allowed_endpoints = endpoints.split(" ") // endpoints are space separated 
  if (allowed_endpoints.length > 0) {
    for (let endp of allowed_endpoints) {
      cp.execSync(`echo "${endp}" > "step_policy_endpoint_\`echo "${endp}" | base64\`"`)
    }
    applyPolicy(allowed_endpoints.length);
  }
  
}


function applyPolicy(count:Number){
  cp.execSync(`echo "step_policy_apply_${count}" > "step_policy_apply_${count}"`)
}

export function removeStepPolicyFiles(){
  cp.execSync("rm step_policy_*")
}