(async () => {
  if (process.platform !== "linux") {
    console.log("Only runs on linux");
    return;
  }
})();
