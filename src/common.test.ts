import { addSummary } from "./common";
import * as cp from "child_process";

test("adding stepsecurity summary in github_summary", async () => {
  let expected = `<h3>StepSecurity Harden-Runner Summary</h3>
<a href="https://app.stepsecurity.io/github/step-security/test/actions/runs/12345">:detective: View security insights and recommended policy</a>`;

  const github_summary = "/tmp/github_summary";
  cp.execSync(`touch ${github_summary}`);

  process.env["STATE_monitorStatusCode"] = "200";
  process.env["GITHUB_STEP_SUMMARY"] = github_summary;
  process.env["GITHUB_REPOSITORY"] = "step-security/test";
  process.env["GITHUB_RUN_ID"] = "12345";

  await addSummary();

  let output = cp.execSync(`cat ${github_summary}`).toString();
  cp.execSync(`rm ${github_summary}`);

  expect(output).toMatch(expected);
  
});