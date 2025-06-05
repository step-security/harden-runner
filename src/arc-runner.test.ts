import { isARCRunner } from "./arc-runner";

it("should correctly recognize arc based runner", async () => {
  process.env["GITHUB_ACTIONS_RUNNER_EXTRA_USER_AGENT"] =
    "actions-runner-controller/2.0.1";

  let isArc: boolean = await isARCRunner();
  expect(isArc).toBe(true);
});
