import * as core from "@actions/core";
import * as fs from "fs";

export function printInfo(web_url) {
  console.log(
    "\x1b[32m%s\x1b[0m",
    "View security insights and recommended policy at:"
  );

  console.log(
    `${web_url}/github/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]}`
  );
}

export const processLogLine = (
  line: string,
  tableEntries: {
    pid: string;
    process: string;
    domain: string;
    ipAddress: string;
    status: string;
  }[]
): void => {
  if (
    line.includes("pid") &&
    line.includes("process") &&
    line.includes("domain") &&
    line.includes("ip address")
  ) {
    const matches = line.match(
      /ip address:port ([\d.:]+), domain: ([\w.-]+), pid: (\d+), process: (\w+)/
    );
    if (matches) {
      const [ipAddress, domain, pid, process] = matches.slice(1);

      // Check if all values are non-empty
      if (pid && process && domain && ipAddress) {
        const status = ipAddress.startsWith("54.185.253.63")
          ? "❌ Blocked"
          : "✅ Allowed";

        tableEntries.push({ pid, process, domain, ipAddress, status });
      }
    }
  }
};

export async function addSummary() {
  if (process.env.STATE_monitorStatusCode !== "200") {
    return;
  }

  const web_url = "https://app.stepsecurity.io";
  const insights_url = `${web_url}/github/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]}`;

  const log = "/home/agent/agent.log";
  if (!fs.existsSync(log)) {
    return;
  }

  let needsSubscription = false;
  try {
    let data = fs.readFileSync("/home/agent/annotation.log", "utf8");
    if (data.includes("StepSecurity Harden Runner is disabled")) {
      needsSubscription = true;
    }
  } catch (err) {
    //console.error(err);
  }

  if (needsSubscription) {
    await core.summary
      .addSeparator()
      .addRaw(
        `<h2>⚠️ Your GitHub Actions Runtime Security is currently disabled!</h2>`
      );

    await core.summary
      .addRaw(
        `
<p>It appears that you're using the <a href="https://github.com/step-security/harden-runner">Harden-Runner GitHub Action</a> by StepSecurity within a private repository. However, runtime security is not enabled as your organization hasn't signed up for a free trial or a paid subscription yet.</p>
<p>To enable runtime security, start a free trial today by installing the <a href="https://github.com/apps/stepsecurity-actions-security">StepSecurity Actions Security GitHub App</a>. For more information or assistance, feel free to reach out to us through our <a href="https://www.stepsecurity.io/contact">contact form</a>.</p>
`
      )
      .addSeparator()
      .write();
    return;
  }

  const content = fs.readFileSync(log, "utf-8");
  const lines = content.split("\n");

  let tableEntries = [];

  for (const line of lines) {
    processLogLine(line, tableEntries);
  }

  if (tableEntries.length === 0) {
    return;
  }

  let insightsRow = `<tr>
      <td colspan="3" align="center"><a href="${insights_url}">🛡️ View all events & the recommended policy at StepSecurity</a></td>
    </tr>`;

  await core.summary
    .addSeparator()
    .addRaw(
      `<h2><a href="${insights_url}">StepSecurity Runtime Security Report for this Workflow Run</a></h2>`
    );

  tableEntries.sort((a, b) => {
    if (a.status === "❌ Blocked" && b.status !== "❌ Blocked") {
      return -1;
    } else if (a.status !== "❌ Blocked" && b.status === "❌ Blocked") {
      return 1;
    } else {
      return 0;
    }
  });

  tableEntries = tableEntries.slice(0, 3);

  await core.summary.addRaw(`
  <p>This report summarizes the network events that occurred during this workflow run on a GitHub-hosted runner.</p>
  <h3>🌐 Network Events</h3>
  <table>
    <thead>
      <tr>
        <th>Process</th>
        <th>Endpoint</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${tableEntries
        .map(
          (entry) => `<tr>
          <td>${entry.process}</td>
          <td>${entry.domain.replace(/\.$/, "")}</td>
          <td>${entry.status}</td>
        </tr>`
        )
        .join("")}
      <tr>
        <td>...</td>
        <td>...</td>
        <td>...</td>
      </tr>
       ${insightsRow}
    </tbody>
  </table>
`);

  await core.summary
    .addSeparator()
    .addRaw(
      `<blockquote>You are seeing this markdown since this workflow uses the <a href="https://github.com/step-security/harden-runner">Harden-Runner GitHub Action</a> for runtime security.`
    )
    .addSeparator()
    .write();
}

export const STATUS_HARDEN_RUNNER_UNAVAILABLE = "409";

export const CONTAINER_MESSAGE =
  "This job is running in a container. Harden Runner does not run in a container as it needs sudo access to run. This job will not be monitored.";

export const UBUNTU_MESSAGE =
  "This job is not running in a GitHub Actions Hosted Runner Ubuntu VM. Harden Runner is only supported on Ubuntu VM. This job will not be monitored.";

export const HARDEN_RUNNER_UNAVAILABLE_MESSAGE =
  "Sorry, we are currently experiencing issues with the Harden Runner installation process. It is currently unavailable.";

export const ARC_RUNNER_MESSAGE =
  "Workflow is currently being executed in ARC based runner";
