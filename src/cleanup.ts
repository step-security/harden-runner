import * as fs from "fs";
import * as cp from "child_process";
import * as common from "./common";
import isDocker from "is-docker";
import { isArcRunner } from "./arc-runner";
import { isGithubHosted } from "./tls-inspect";
(async () => {
  console.log("[harden-runner] post-step");

  if (process.platform !== "linux") {
    console.log(common.UBUNTU_MESSAGE);
    return;
  }
  if (isGithubHosted() && isDocker()) {
    console.log(common.CONTAINER_MESSAGE);
    return;
  }

  if (isArcRunner()) {
    console.log(`[!] ${common.ARC_RUNNER_MESSAGE}`);
    return;
  }

  if (process.env.STATE_selfHosted === "true") {
    return;
  }

  if (process.env.STATE_isTLS === "false" && process.arch === "arm64") {
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

  const doneFile = "/home/agent/done.json";
  let counter = 0;
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

  const log = "/home/agent/agent.log";
  if (fs.existsSync(log)) {
    console.log("log:");
    var content = fs.readFileSync(log, "utf-8");
    console.log(content);
  }

  const daemonLog = "/home/agent/daemon.log";
  if (fs.existsSync(daemonLog)) {
    console.log("daemonLog:");
    var content = fs.readFileSync(daemonLog, "utf-8");
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
