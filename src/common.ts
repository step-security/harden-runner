export function printInfo(web_url) {
  console.log("View security insights and recommended policy at:");
  console.log(
    "\x1b[34m%s\x1b[0m",
    `${web_url}/github/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]}`
  );
}
