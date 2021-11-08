(async () => {
  if (process.platform !== "linux") {
    console.log("Only runs on linux");
    return;
  }

  var env = "beta";

  console.log(
    `View security insights and recommended policy at https://${env}.stepsecurity.io/github/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]}} after the run has finished`
  );
})();
