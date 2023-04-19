import { addSummary } from "./common";
import * as cp from "child_process";

test("adding stepsecurity summary in github_summary", async () => {
  let expected = `<hr>
<p><picture>
          <source media=\"(prefers-color-scheme: light)\" srcset=\"https://github.com/step-security/harden-runner/raw/main/images/banner.png\" width=\"200\">
          <img alt=\"Dark Banner\" src=\"https://github.com/step-security/harden-runner/raw/main/images/banner-dark.png\" width=\"200\">
        </picture></p>
<a href=\"https://app.stepsecurity.io/github/step-security/test/actions/runs/12345\">View security insights and recommended policy</a>
<hr>
`;

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
