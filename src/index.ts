import * as common from "./common";
import * as core from "@actions/core";
import isDocker from "is-docker";
import { STEPSECURITY_WEB_URL } from "./configs";
import { isGithubHosted } from "./tls-inspect";
import { context } from "@actions/github";
import { isPlatformSupported } from "./utils";

(async () => {
  console.log("[harden-runner] main-step");

  const customProperties = context?.payload?.repository?.custom_properties || {};
  if (customProperties["skip-harden-runner"] === "true") {
    console.log("Skipping harden-runner: custom property 'skip-harden-runner' is set to 'true'");
    return;
  }

  if (!isPlatformSupported(process.platform)) {
    console.log(common.UNSUPPORTED_RUNNER_MESSAGE);
    return;
  }
  if (isGithubHosted() && isDocker()) {
    console.log(common.CONTAINER_MESSAGE);
    return;
  }

  if (
    String(process.env.STATE_monitorStatusCode) ===
    common.STATUS_HARDEN_RUNNER_UNAVAILABLE
  ) {
    console.log(common.HARDEN_RUNNER_UNAVAILABLE_MESSAGE);
    return;
  }

  if (process.env.STATE_isTLS === "false" && process.arch === "arm64") {
    return;
  }

  if (
    core.getBooleanInput("disable-telemetry") &&
    core.getInput("egress-policy") === "block"
  ) {
    console.log(
      "Telemetry will not be sent to StepSecurity API as disable-telemetry is set to true"
    );
  } else {
    var web_url = STEPSECURITY_WEB_URL;
    common.printInfo(web_url);
  }
})();
