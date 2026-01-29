import * as fs from "fs";
import * as cp from "child_process";
import * as common from "./common";
import isDocker from "is-docker";
import { isARCRunner } from "./arc-runner";
import { isGithubHosted } from "./tls-inspect";
import { context } from "@actions/github";
(async () => {
  console.log("[harden-runner] post-step");

  const customProperties =
    context?.payload?.repository?.custom_properties || {};
  if (customProperties["skip-harden-runner"] === "true") {
    console.log(
      "Skipping harden-runner: custom property 'skip-harden-runner' is set to 'true'"
    );
    return;
  }

  let platform = process.platform;
  switch (platform) {
    case "linux":
    case "darwin":
      break;
    default:
      console.log(common.UBUNTU_MESSAGE);
      return;
  }
  if (isGithubHosted() && isDocker()) {
    console.log(common.CONTAINER_MESSAGE);
    return;
  }

  if (isARCRunner()) {
    console.log(`[!] ${common.ARC_RUNNER_MESSAGE}`);
    return;
  }

  switch (platform) {
    case "darwin":
      await handleDarwinCleanup();
      break;

    case "linux":
      await handleLinuxCleanup();
      break;
  }

  try {
    await common.addSummary();
  } catch (exception) {
    console.log(exception);
  }
})();

async function handleDarwinCleanup() {
  fs.writeFileSync(
    "/opt/step-security/post_event.json",
    JSON.stringify({ event: "post" })
  );

  let macDone = "/opt/step-security/done.json";
  let counter = 0;
  while (true) {
    if (!fs.existsSync(macDone)) {
      counter++;
      if (counter > 10) {
        console.log("timed out");
        break;
      }
      await sleep(1000);
    } else {
      // The file *does* exist
      break;
    }
  }

  let macAgenLog = "/opt/step-security/agent.log";
  if (fs.existsSync(macAgenLog)) {
    console.log("macAgenLog:");
    var content = fs.readFileSync(macAgenLog, "utf-8");
    console.log(content);
  } else {
    console.log("😭 macos agent.log file not found");
  }

  // Capture system log stream for harden-runner subsystem
  try {
    console.log("\nSystem log stream for io.stepsecurity.harden-runner:");
    const logStreamOutput = cp.execSync(
      "log show --predicate 'subsystem == \"io.stepsecurity.harden-runner\"' --info --last 10m",
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: 10000, // 30 second timeout
      }
    );
    console.log(logStreamOutput);
  } catch (error) {
    console.log("Warning: Could not fetch system log stream:", error.message);
  }
}

async function handleLinuxCleanup() {
  if (process.env.STATE_selfHosted === "true") {
    return;
  }

  if (process.env.STATE_customVMImage === "true") {
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

  if (isGithubHosted() && fs.existsSync("/home/agent/post_event.json")) {
    console.log("Post step already executed, skipping");
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
    } else {
      // The file *does* exist
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
  var disable_sudo_and_containers = process.env.STATE_disableSudoAndContainers;

  if (disable_sudo !== "true" && disable_sudo_and_containers !== "true") {
    try {
      var journalLog = cp.execSync(
        "sudo journalctl -u agent.service --lines=1000",
        {
          encoding: "utf8",
          maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        }
      );
      console.log("agent.service log:");
      console.log(journalLog);
    } catch (error) {
      console.log("Warning: Could not fetch service logs:", error.message);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
