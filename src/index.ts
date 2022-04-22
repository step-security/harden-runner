import { printInfo } from "./common";
import * as core from "@actions/core";
import isDocker from "is-docker";

(async () => {
  if (process.platform !== "linux") {
    console.log("Only runs on linux");
    return;
  }
  if (isDocker()) {
    console.log(
      "StepSecurity Harden Runner does not run inside a Docker container"
    );
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
    var web_url = "https://app.stepsecurity.io";
    printInfo(web_url);
  }
})();
