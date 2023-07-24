import * as fs from "fs";
import * as cp from "child_process";
import * as core from "@actions/core";
import * as common from "./common";
import isDocker from "is-docker";
import * as cache from "@actions/cache";
import { cacheFile, cacheKey, isValidEvent } from "./cache";
import path from "path";
import { arcCleanUp, isArcRunner, removeStepPolicyFiles } from "./arc-runner";

(async () => {
  if (process.platform !== "linux") {
    console.log(common.UBUNTU_MESSAGE);
    return;
  }
  if (isDocker()) {
    console.log(common.CONTAINER_MESSAGE);
    return;
  }

  if (isValidEvent()) {
    try {
      const cacheResult = await cache.saveCache(
        [path.join(__dirname, "cache.txt")],
        cacheKey
      );
      console.log(cacheResult);
    } catch (exception) {
      console.log(exception);
    }
  }

  if (isArcRunner()) {
    console.log(`[!] ${common.ARC_RUNNER_MESSAGE}`);
    arcCleanUp();
    removeStepPolicyFiles();
    return;
  }

  if (
    String(process.env.STATE_monitorStatusCode) ===
    common.STATUS_HARDEN_RUNNER_UNAVAILABLE
  ) {
    console.log(common.HARDEN_RUNNER_UNAVAILABLE_MESSAGE);
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

  var disable_sudo = process.env.STATE_disableSudo;
  if (disable_sudo !== "true") {
    var journalLog = cp.execSync("sudo journalctl -u agent.service", {
      encoding: "utf8",
    });
    console.log("Service log:");
    console.log(journalLog);
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
