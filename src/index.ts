import { printInfo } from "./common";

(async () => {
  if (process.platform !== "linux") {
    console.log("Only runs on linux");
    return;
  }

  var web_url = "https://app.stepsecurity.io";
  printInfo(web_url);
})();
