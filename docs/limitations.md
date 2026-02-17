## Limitations

### GitHub-Hosted Runners
* Harden-Runner is not supported when [job is run in a container](https://docs.github.com/en/actions/using-jobs/running-jobs-in-a-container) with built-in labels such as `ubuntu-latest`, as it needs sudo access on the Ubuntu VM to run. The limitation is if the entire job is run in a container. However, such jobs can be monitored when using custom VM images with GitHub-hosted runners. This is also not a limitation for Self-Hosted runners.

### Self-Hosted Actions Runner Controller (ARC) Runners

* Since ARC Harden Runner uses eBPF, only Linux jobs are supported. Windows and MacOS jobs are not supported.
