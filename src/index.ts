(async () => {
  if (process.platform !== "linux") {
    console.log("Only runs on linux");
    return;
  }

  var web_url = "https://app.stepsecurity.io";

  console.log(
    `View security insights and recommended policy at ${web_url}/github/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]} after the run has finished`
  );
})();
