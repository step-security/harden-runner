<p align="center">
<picture>
  <source media="(prefers-color-scheme: light)" srcset="images/banner.png" width="400">
  <img alt="Dark Banner" src="images/banner-dark.png" width="400">
</picture>
</p>

<div align="center">

[![Maintained by stepsecurity.io](https://img.shields.io/badge/maintained%20by-stepsecurity.io-blueviolet)](https://stepsecurity.io/?utm_source=github&utm_medium=organic_oss&utm_campaign=harden-runner)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/step-security/harden-runner/badge)](https://api.securityscorecards.dev/projects/github.com/step-security/harden-runner)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://raw.githubusercontent.com/step-security/harden-runner/main/LICENSE)

</div>

## GitHub Actions Runtime Security

Harden-Runner GitHub Action provides Runtime Security for GitHub-Hosted runners and self-hosted Actions Runner Controller (ARC) environments.

[![Harden Runner Demo](images/RuntimeSecurityDemo.gif)](https://youtu.be/fpdwX5hYACo)

## Explore open source projects using Harden-Runner

| [![Microsoft](https://avatars.githubusercontent.com/u/6154722?s=60&v=4)](https://app.stepsecurity.io/github/microsoft/ebpf-for-windows/actions/runs/5559160177) | [![Google](https://avatars.githubusercontent.com/u/2810941?s=60&v=4)](https://app.stepsecurity.io/github/GoogleCloudPlatform/functions-framework-ruby/actions/runs/5546354505) | [![DataDog](https://avatars.githubusercontent.com/u/365230?s=60&v=4)](https://app.stepsecurity.io/github/DataDog/stratus-red-team/actions/runs/5387101451) | [![Intel](https://avatars.githubusercontent.com/u/17888862?s=60&v=4)](https://app.stepsecurity.io/github/intel/cve-bin-tool/actions/runs/5579910614) | [![Kubernetes](https://avatars.githubusercontent.com/u/36015203?s=60&v=4)](https://app.stepsecurity.io/github/kubernetes-sigs/cluster-api-provider-azure/actions/runs/5581511101) |
| --- | --- | --- | --- | --- |
| **Microsoft**<br>[Explore](https://app.stepsecurity.io/github/microsoft/ebpf-for-windows/actions/runs/5559160177) | **Google**<br>[Explore](https://app.stepsecurity.io/github/GoogleCloudPlatform/functions-framework-ruby/actions/runs/5546354505) | **DataDog**<br>[Explore](https://app.stepsecurity.io/github/DataDog/stratus-red-team/actions/runs/5387101451) | **Intel**<br>[Explore](https://app.stepsecurity.io/github/intel/cve-bin-tool/actions/runs/5579910614) | **Kubernetes**<br>[Explore](https://app.stepsecurity.io/github/kubernetes-sigs/cluster-api-provider-azure/actions/runs/5581511101) |

## Why

Compromised workflows, dependencies, and build tools typically make outbound calls to exfiltrate credentials, or may tamper source code, dependencies, or artifacts during the build.

Harden-Runner GitHub Action monitors process, file, and network activity to:

|     | Countermeasure                                                                               | Prevent Security Breach                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.  | Block egress traffic at the DNS (Layer 7) and network layers (Layers 3 and 4) to prevent exfiltration of credentials | To prevent [Codecov breach](https://github.com/step-security/github-actions-goat/blob/main/docs/Vulnerabilities/ExfiltratingCICDSecrets.md) scenario                                                                                                         |
| 2.  | Detect if source code is being overwritten during the build process to inject a backdoor     | To detect [SolarWinds incident](https://github.com/step-security/attack-simulator/blob/main/docs/MonitorSourceCode.md) scenario                                                                                                           |
| 3.  | Detect poisoned workflows and compromised dependencies              | To detect [Dependency confusion](https://github.com/step-security/attack-simulator/blob/main/docs/DNSExfiltration.md) and [Malicious dependencies](https://github.com/step-security/attack-simulator/blob/main/docs/CompromisedDependency.md) |

Read this [case study](https://infosecwriteups.com/detecting-malware-packages-in-github-actions-7b93a9985635) on how Harden-Runner detected malicious packages in the NPM registry.

## How

1. Add `step-security/harden-runner` to your GitHub Actions workflow file as the first step in each job.

   ```yaml
   steps:
     - uses: step-security/harden-runner@55d479fb1c5bcad5a4f9099a5d9f37c8857b2845 # v2.4.1
       with:
         egress-policy: audit
   ```

2. In the workflow logs and the job markdown summary, you will see a link to security insights and recommendations.

    <p align="left">
      <img src="images/buildlog1.png" alt="Link in build log" >
    </p>

3. Click on the link ([example link](https://app.stepsecurity.io/github/microsoft/msquic/actions/runs/5577342236)). You will see a process monitor view of network and file events correlated with each step of the job.

    <p align="left">
      <img src="images/Insights4.png" alt="Insights from harden-runner" >
    </p>

4. Under the insights section, you'll find a Recommended Policy. You can either update your workflow file with this Policy, or alternatively, use the [Policy Store](https://docs.stepsecurity.io/harden-runner/how-tos/block-egress-traffic#2-add-the-policy-using-the-policy-store) to apply the policy without modifying the workflow file.

    <p align="left">
      <img src="images/rec-policy1.png" alt="Policy recommended by harden-runner" >
    </p>

## Support for ARC and Private Repositories

Actions Runner Controller (ARC) and Private repositories are supported with a commercial license. Check out the [documentation](https://docs.stepsecurity.io/stepsecurity-platform/billing) for more details.

Install the [StepSecurity Actions Security GitHub App](https://github.com/apps/stepsecurity-actions-security) to use Harden-Runner GitHub Action for `Private` repositories.

- If you use Harden-Runner GitHub Action in a private repository, the generated insights URL is NOT public.
- You need to authenticate first to access insights URL for private repository. Only those who have access to the repository can view it.
- [StepSecurity Actions Security GitHub App](https://github.com/apps/stepsecurity-actions-security) only needs `actions: read` permissions on your repositories.

Read this [case study on how Kapiche uses Harden-Runner](https://www.stepsecurity.io/case-studies/kapiche/) to improve software supply chain security in their private repositories.

## Features at a glance

For details, check out the documentation at https://docs.stepsecurity.io

### 🚦 Restrict egress traffic to allowed endpoints

Once allowed endpoints are set in the policy in the workflow file, or in the [Policy Store](https://docs.stepsecurity.io/harden-runner/how-tos/block-egress-traffic#2-add-the-policy-using-the-policy-store)

- Harden-Runner blocks egress traffic at the DNS (Layer 7) and network layers (Layers 3 and 4).
- It blocks DNS exfiltration, where attacker tries to send data out using DNS resolution
- Blocks outbound traffic using IP tables
- Wildcard domains are supported, e.g. you can add `*.data.mcr.microsoft.com:443` to the allowed list, and egress traffic will be allowed to `eastus.data.mcr.microsoft.com:443` and `westus.data.mcr.microsoft.com:443`.

<p align="left">
  <img src="images/block-outbound-call.png" alt="Policy recommended by harden-runner" >
</p>

### 🕵️ Detect tampering of source code during build

Harden-Runner monitors file writes and can detect if a file is overwritten.

- Source code overwrite is not expected in a release build
- All source code files are monitored, which means even changes to IaC files (Kubernetes manifest, Terraform) are detected
- You can enable notifications to get one-time alert when source code is overwritten

<p align="left">
  <img src="images/fileoverwrite.png" alt="Policy recommended by harden-runner" >
</p>

### 🚫 Run your job without sudo access

GitHub-hosted runner uses passwordless sudo for running jobs.

- This means compromised build tools or dependencies can install attack tools
- If your job does not need sudo access, you see a policy
  recommendation to disable sudo in the insights page
- When you set `disable-sudo` to `true`, the job steps run without sudo access to the Ubuntu VM

### 🔔 Get security alerts

Install the [StepSecurity Actions Security GitHub App](https://github.com/apps/stepsecurity-actions-security) to get security alerts.

- Email and Slack notifications are supported
- Notifications are sent when outbound traffic is blocked or source code is overwritten
- Notifications are not repeated for the same alert for a given workflow

## Discussions

If you have questions or ideas, please use [discussions](https://github.com/step-security/harden-runner/discussions). For support for ARC and Private repositories, email info@stepsecurity.io.

## How does it work?

For GitHub-hosted runners, Harden-Runner GitHub Action downloads and installs the StepSecurity Agent.

- The code to monitor file, process, and network activity is in the Agent.
- The agent is written in Go and is open source at https://github.com/step-security/agent
- The agent's build is reproducible. You can view the steps to reproduce the build [here](http://app.stepsecurity.io/github/step-security/agent/releases/latest)

## Limitations for GitHub-Hosted Runners

1. Only Ubuntu VM is supported. Windows and MacOS GitHub-hosted runners are not supported. There is a discussion about that [here](https://github.com/step-security/harden-runner/discussions/121).
2. Harden-Runner is not supported when [job is run in a container](https://docs.github.com/en/actions/using-jobs/running-jobs-in-a-container) as it needs sudo access on the Ubuntu VM to run. It can be used to monitor jobs that use containers to run steps. The limitation is if the entire job is run in a container. That is not common for GitHub Actions workflows, as most of them run directly on `ubuntu-latest`.
