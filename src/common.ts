export function printInfo(web_url) {
  console.log("View security insights and recommended policy at");
  console.log(
    `${web_url}/github/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]} after the run has finished`
  );
}
