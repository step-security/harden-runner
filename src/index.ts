import { printInfo } from "./common";
import * as core from "@actions/core";

(async () => {
  if (process.platform !== "linux") {
    console.log("Only runs on linux");
    return;
  }

  if (core.getBooleanInput("disable-telemetry") === true && core.getInput("egress-policy") === "block"){
    core.warning("Insights will not be sent to StepSecurity API as disable-telemetry is set to true");
  }
  else{
    var web_url = "https://app.stepsecurity.io";
    printInfo(web_url);
  }
})();
