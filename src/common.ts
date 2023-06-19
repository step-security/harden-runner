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
      .addRaw(`<h2>❌ GitHub Actions Runtime Security is disabled</h2>`);

    await core.summary
      .addRaw(
        `
<p>You are seeing this markdown since this workflow uses the <a href="https://github.com/step-security/harden-runner">Harden-Runner GitHub Action</a> by StepSecurity in a private repository, but your organization has not signed up for a free trial or a paid subscription.</p>
<p>To start a free trial, install the <a href="http://github.com/apps/stepsecurity-actions-security">StepSecurity Actions Security GitHub App</a> or reach out to us via our <a href="https://www.stepsecurity.io/contact">contact form.</a></p>
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
      <td colspan="3" align="center"><a href="${insights_url}">🛡️ Check out the full report and recommended policy at StepSecurity</a></td>
    </tr>`;

  await core.summary.addSeparator().addRaw(
    `<h2><a href="${insights_url}">StepSecurity Report</a></h2>
      <h3>GitHub Actions Runtime Security</h3>`
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
      `<blockquote>You are seeing this markdown since this workflow uses the <a href="https://github.com/step-security/harden-runner">Harden-Runner GitHub Action</a>. 
      Harden-Runner is a security agent for GitHub-hosted runners to block egress traffic & detect code overwrite to prevent breaches.</blockquote>`
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
