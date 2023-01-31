import * as common from "./common";
import * as core from "@actions/core";
import isDocker from "is-docker";

(async () => {
  if (process.platform !== "linux") {
    console.log(common.UBUNTU_MESSAGE);
    return;
  }
  if (isDocker()) {
    console.log(common.CONTAINER_MESSAGE);
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
    common.dropOnBadStatus(process.env.STATE_monitorStatusCode,"StepSecurity Agent not installed");
    var web_url = "https://app.stepsecurity.io";
    common.printInfo(web_url);
  }
})();
