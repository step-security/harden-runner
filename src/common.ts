import * as core from "@actions/core";
import { STEPSECURITY_API_URL, STEPSECURITY_WEB_URL } from "./configs";
import { getAnnotationLogs } from "./utils";

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

      // Check if all values are non-empty and domain does not end with specified patterns
      if (
        pid &&
        process &&
        domain &&
        ipAddress &&
        !domain.endsWith(".actions.githubusercontent.com.") &&
        !domain.endsWith(".blob.core.windows.net.")
      ) {
        const status = ipAddress.startsWith("54.185.253.63")
          ? "❌ Blocked"
          : "✅ Allowed";

        tableEntries.push({ pid, process, domain, ipAddress, status });
      }
    }
  }
};

export async function addSummary() {
  if (process.env.STATE_addSummary !== "true") {
    return;
  }

  const correlation_id = process.env.STATE_correlation_id;
  if (!correlation_id) {
    return;
  }


  let needsSubscription = false;
  try {
    let data = getAnnotationLogs(process.platform);
    if (
      data !== undefined &&
      data.includes("StepSecurity Harden Runner is disabled")
    ) {
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

  // Extract owner and repo from GITHUB_REPOSITORY (format: owner/repo)
  const [owner, repo] = process.env["GITHUB_REPOSITORY"]?.split("/") || [];
  const run_id = process.env["GITHUB_RUN_ID"];

  if (!owner || !repo || !run_id || !correlation_id) {
    return;
  }

  // Fetch job summary from API
  const apiUrl = `${STEPSECURITY_API_URL}/github/${owner}/${repo}/actions/runs/${run_id}/correlation/${correlation_id}/job-markdown-summary`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      console.error(`Failed to fetch job summary: ${response.status} ${response.statusText}`);
      return;
    }

    const markdownSummary = await response.text();

    // Render the markdown summary using core.summary.addRaw
    await core.summary.addRaw(markdownSummary).write();
    return;
  } catch (error) {
    console.error(`Error fetching job summary: ${error}`);
    return;
  }
}

export const STATUS_HARDEN_RUNNER_UNAVAILABLE = "409";

export const CONTAINER_MESSAGE =
  "This job is running in a container. Such jobs can be monitored by installing Harden Runner in a custom VM image for GitHub-hosted runners.";

export const UNSUPPORTED_RUNNER_MESSAGE =
  "This job is not running in a GitHub Actions Hosted Runner. Harden Runner is only supported on GitHub-hosted runners (Ubuntu, Windows, and macOS). This job will not be monitored.";

export const SELF_HOSTED_RUNNER_MESSAGE =
  "This job is running on a self-hosted runner.";

export const HARDEN_RUNNER_UNAVAILABLE_MESSAGE =
  "Sorry, we are currently experiencing issues with the Harden Runner installation process. It is currently unavailable.";

export const ARC_RUNNER_MESSAGE =
  "Workflow is currently being executed in ARC based runner.";

export const ARM64_RUNNER_MESSAGE =
  "ARM runners are not supported in the Harden-Runner community tier.";
