import { printInfo } from "./common";
import * as core from "@actions/core";

(async () => {
  if (process.platform !== "linux") {
    console.log("Only runs on linux");
    return;
  }

  if (core.getInput("send-insights") === 'true'){
    var web_url = "https://app.stepsecurity.io";
    printInfo(web_url);
  }
  else{
    core.warning("Insights will not be sent to StepSecurity API as send-insights is set to false");
  }
})();
