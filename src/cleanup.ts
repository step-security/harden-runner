import * as fs from "fs";
import * as cp from "child_process";
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
  if (fs.existsSync(log)) {
    console.log("log:");
    var content = fs.readFileSync(log, "utf-8");
    console.log(content);
  }

  var status = "/home/agent/agent.status";
  if (fs.existsSync(status)) {
    console.log("status:");
    var content = fs.readFileSync(status, "utf-8");
    console.log(content);
  }

  // write annotations
  var annotationsFile = "/home/agent/annotation.log";
  if (fs.existsSync(annotationsFile)) {
    var content = fs.readFileSync(annotationsFile, "utf-8");
    content.split(/\r?\n/).forEach((line) => {
      core.error(line);
    });
  }

  if (!fs.existsSync(doneFile)) {
    var journalLog = cp.execSync("sudo journalctl -u agent.service", {
      encoding: "utf8",
    });
    console.log("Service log:");
    console.log(journalLog);
  }
})();

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
