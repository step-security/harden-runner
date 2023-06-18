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
          : "✔️ Allowed";

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

  const content = fs.readFileSync(log, "utf-8");
  const lines = content.split("\n");

  let tableEntries = [];

  for (const line of lines) {
    processLogLine(line, tableEntries);
  }

  if (tableEntries.length === 0) {
    return;
  }

  await core.summary
    .addSeparator()
    .addRaw(`<h2>GitHub Actions Runtime Security</h2>`);

  tableEntries.sort((a, b) => {
    if (a.status === "❌ Blocked" && b.status !== "❌ Blocked") {
      return -1;
    } else if (a.status !== "❌ Blocked" && b.status === "❌ Blocked") {
      return 1;
    } else {
      return 0;
    }
  });

  tableEntries = tableEntries.slice(0, 3); // Limit the table entries

  await core.summary.addRaw(`
  <h3>🌐 Outbound Network Traffic</h3>
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
      <tr>
        <td colspan="3" align="center"><a href="${insights_url}">View full report and recommended policy at StepSecurity</a></td>
      </tr>
    </tbody>
  </table>
`);

  await core.summary
    .addRaw(
      `<blockquote>Powered by <a href="https://step-security/harden-runner">https://step-security/harden-runner</a></blockquote>`
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
