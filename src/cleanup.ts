import * as fs from "fs";
import * as cp from "child_process";

(async () => {
  if (process.platform !== "linux") {
    console.log("Only runs on linux");
    return;
  }

  fs.writeFileSync(
    "/home/agent/post_event.json",
    JSON.stringify({ event: "post" })
  );

  var doneFile = "/home/agent/done.json";
  var counter = 0;
  while (true) {
    if (!fs.existsSync(doneFile)) {
      counter++;
      if (counter > 10) {
        console.log("timed out");

        break;
      }
      await sleep(1000);
    } // The file *does* exist
    else {
      break;
    }
  }

  var log = "/home/agent/agent.log";
  console.log("log:");
  var content = fs.readFileSync(log, "utf-8");
  console.log(content);
  var status = "/home/agent/agent.status";
  if (fs.existsSync(status)) {
    console.log("status:");
    var content = fs.readFileSync(status, "utf-8");
    console.log(content);
  }

  if (!fs.existsSync(doneFile)) {
    cp.execSync("sudo journalctl -u agent.service");
  }
})();

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
