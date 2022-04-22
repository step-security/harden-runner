export function printInfo(web_url) {
  console.log(
    "\x1b[32m%s\x1b[0m",
    "View security insights and recommended policy at:"
  );

  console.log(
    `${web_url}/github/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]}`
  );
}

export const CONTAINER_MESSAGE =
  "This job is running in a container. Harden Runner does not run in a container as it needs sudo access to run. This job will not be monitored.";

export const UBUNTU_MESSAGE =
  "This job is not running in a GitHub Actions Hosted Runner Ubuntu VM. Harden Runner is only supported on Ubuntu VM. This job will not be monitored.";
