import {
  isArcRunner,
  sendAllowedEndpoints,
  validateEndpoints,
} from "./arc-runner";

it("should correctly recognize arc based runner", async () => {
  process.env["GITHUB_ACTIONS_RUNNER_EXTRA_USER_AGENT"] =
    "actions-runner-controller/2.0.1";

  let isArc: boolean = await isArcRunner();
  expect(isArc).toBe(true);
});

it("should write endpoint files", () => {
  process.env["isTest"] = "1";

  let allowed_endpoints = [
    "github.com:443",
    "*.google.com:443",
    "youtube.com:443",
  ].join(" ");
  sendAllowedEndpoints(allowed_endpoints);
});

it("should validate endpoints", () => {
  let allowedEndpoints = [
    "github.com:443",
    "*.google.com:443",
    "youtube.com:443",
  ].join(" ");
  let areValid = validateEndpoints(allowedEndpoints);
  expect(areValid).toBe(true);

  // presence of invalid endpoint
  allowedEndpoints = ["github.com:443", "*.google.com", "youtube.com"].join(
    " "
  );
  areValid = validateEndpoints(allowedEndpoints);
  expect(areValid).toBe(false);
});
