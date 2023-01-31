import * as fs from "fs";
import * as cp from "child_process";
import * as core from "@actions/core";
import * as common from "./common";
import isDocker from "is-docker";
import * as cache from "@actions/cache";
import { cacheFile, cacheKey, isValidEvent } from "./cache";
import path from "path";

(async () => {
  if (process.platform !== "linux") {
    console.log(common.UBUNTU_MESSAGE);
    return;
  }
  if (isDocker()) {
    console.log(common.CONTAINER_MESSAGE);
    return;
  }

  if (process.env.STATE_monitorStatusCode === "503") {
    core.info("[StepSecurity Harden-Runner]: Nothing for cleanup as agent was not installed.");
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

  var disable_sudo = core.getBooleanInput("disable-sudo");
  if (!disable_sudo) {
    var journalLog = cp.execSync("sudo journalctl -u agent.service", {
      encoding: "utf8",
    });
    console.log("Service log:");
    console.log(journalLog);
  }

  if (isValidEvent()) {
    try {
      const cmd = "cp";
      const args = [path.join(__dirname, "cache.txt"), cacheFile];
      cp.execFileSync(cmd, args);
      const cacheResult = await cache.saveCache([cacheFile], cacheKey);
      console.log(cacheResult);
    } catch (exception) {
      console.log(exception);
    }
  }

  try {
    await common.addSummary();
  } catch (exception) {
    console.log(exception);
  }
})();

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
