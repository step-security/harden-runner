import * as cp from "child_process";

import {
  isARCRunner,
  normalizeEndpoints,
  sendAllowedEndpoints,
} from "./arc-runner";

jest.mock("child_process");

it("should correctly recognize arc based runner", async () => {
  process.env["GITHUB_ACTIONS_RUNNER_EXTRA_USER_AGENT"] =
    "actions-runner-controller/2.0.1";

  let isArc: boolean = await isARCRunner();
  expect(isArc).toBe(true);
});

describe("normalizeEndpoints", () => {
  it("joins newline-separated endpoints with single spaces", () => {
    expect(
      normalizeEndpoints(
        "registry.npmjs.org:443\npypi.org:443\nfiles.pythonhosted.org:443"
      )
    ).toBe("registry.npmjs.org:443 pypi.org:443 files.pythonhosted.org:443");
  });

  it("collapses runs of spaces and tabs", () => {
    expect(normalizeEndpoints("a:443   b:443\tc:443")).toBe(
      "a:443 b:443 c:443"
    );
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeEndpoints("  a:443 \n")).toBe("a:443");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeEndpoints("")).toBe("");
  });
});

describe("sendAllowedEndpoints", () => {
  const execFileSync = cp.execFileSync as jest.Mock;

  beforeEach(() => {
    execFileSync.mockClear();
  });

  it("sends one policy command per newline-separated endpoint", () => {
    sendAllowedEndpoints(
      "registry.npmjs.org:443\npypi.org:443\nfiles.pythonhosted.org:443"
    );

    const sent = execFileSync.mock.calls
      .map((call) => call[1][0] as string)
      .filter((arg) => arg.startsWith("step_policy_endpoint_"))
      .map((arg) =>
        Buffer.from(arg.substring("step_policy_endpoint_".length), "base64")
          .toString("utf8")
      );

    expect(sent).toEqual([
      "registry.npmjs.org:443",
      "pypi.org:443",
      "files.pythonhosted.org:443",
    ]);
    expect(execFileSync.mock.calls.map((call) => call[1][0])).toContain(
      "step_policy_apply_3"
    );
  });
});
