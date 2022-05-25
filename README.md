# Security agent for GitHub-hosted runner

Harden-Runner GitHub Action installs a security agent on the GitHub-hosted runner (Ubuntu VM) to

1. Detect tampering of source code during build
2. Prevent exfiltration of credentials
3. Detect compromised dependencies or build tools

<p align="left">
      <img src="https://github.com/step-security/supply-chain-goat/blob/main/images/harden-runner/HardenRunnerGIFV.gif" alt="Demo using GIF" width="1440" >
    </p>

## Why

Hijacked dependencies and compromised build tools typically make outbound requests to exfiltrate data or credentials, or may modify source code, dependencies, or artifacts during the build.

Harden-Runner helps you answer these two important questions:
1. Is source code being overwritten during the build process to inject a backdoor? ([SolarWinds incident scenario](https://github.com/step-security/supply-chain-goat/blob/main/MonitorSourceCode.md))
2. Are unexpected outbound network calls being made during the workflow? ([Codecov breach](https://github.com/step-security/supply-chain-goat/blob/main/RestrictOutboundTraffic.md), [Dependency confusion](https://github.com/step-security/supply-chain-goat/blob/main/DNSExfiltration.md), [Malicious dependency](https://github.com/step-security/supply-chain-goat/blob/main/CompromisedDependency.md) scenarios)

## How

1. Add `step-security/harden-runner` to your GitHub Actions workflow file as the first step in each job. In the pre step, the GitHub Actions installs a daemon that monitors process, file, and network activity.

   ```yaml
   steps:
     - uses: step-security/harden-runner@248ae51c2e8cc9622ecf50685c8bf7150c6e8813
       with:
         egress-policy: audit
   ```

2. In the workflow logs, you will see a link to security insights and recommendations.

<p align="left">
  <img src="https://github.com/step-security/supply-chain-goat/blob/main/images/harden-runner/ActionLog.png" alt="Link in build log" >
</p>

3. Click on the link ([example link](https://app.stepsecurity.io/github/ossf/scorecard/actions/runs/2265028928)). You will see a process monitor view of what activities happened as part of each step. This currently includes the programs that made outbound calls and did file writes to source code or dependencies.

<p align="left">
  <img src="https://github.com/step-security/supply-chain-goat/blob/main/images/harden-runner/OutboundCalls2.png" alt="Insights from harden-runner" >
</p>

4. Below the insights, you will see the recommended policy. Add the recommended outbound endpoints to your workflow file, and only traffic to these endpoints will be allowed. When you use `egress-policy: block` mode, you can also set `disable-telemetry: true` to not send telemetry to the StepSecurity API.

<p align="left">
  <img src="https://github.com/step-security/supply-chain-goat/blob/main/images/harden-runner/RecomPolicy1.png" alt="Policy recommended by harden-runner" >
</p>
 

5. If outbound network call is made to an endpoint not in the allowed list or if source code is tampered, you will see an annotation in the workflow run.

<p align="left">
  <img src="https://github.com/step-security/supply-chain-goat/blob/main/images/harden-runner/SourceCodeOverwrite.png" alt="Policy recommended by harden-runner" >
</p>

## Support for private repositories

Install the [Harden Runner App](https://github.com/marketplace/harden-runner-app) if you want to use Harden-Runner GitHub Action for `Private` repositories.  

If you use Harden-Runner GitHub Action in a private repository, the generated insights URL is NOT public. You need to authenticate first to access it for private repository. Only those who have access to the repository can view it. 

Read this [case study on how Kapiche uses Harden Runner](https://www.stepsecurity.io/case-studies/kapiche/) to improve software supply chain security in their open source and private repositories. 

[Harden Runner App](https://github.com/marketplace/harden-runner-app) only needs `actions: read` permissions on your repositories. You can install it on selected repositories, or all repositories in your organization. 

## Discussions

If you have questions or ideas, please use [discussions](https://github.com/step-security/harden-runner/discussions).

1. [Support for private repositories](https://github.com/step-security/harden-runner/discussions/74)
2. [Where should allowed-endpoints be stored?](https://github.com/step-security/harden-runner/discussions/84)
3. [Cryptographically verify tools run as part of the CI/ CD pipeline](https://github.com/step-security/harden-runner/discussions/94)

## Limitations

1. Harden-Runner GitHub Action only works for GitHub-hosted runners. Self-hosted runners are not supported. 
2. Only Ubuntu VM is supported. Windows and MacOS GitHub-hosted runners are not supported. There is a discussion about that [here](https://github.com/step-security/harden-runner/discussions/121).
3. Harden-Runner is not supported when [job is run in a container](https://docs.github.com/en/actions/using-jobs/running-jobs-in-a-container) as it needs sudo access on the Ubuntu VM to run. It can be used to monitor jobs that use containers to run steps. The limitation is if the entire job is run in a container. That is not common for GitHub Actions workflows, as most of them run directly on `ubuntu-latest`.

## Testimonials

> _I think this is a great idea and for the threat model of build-time, an immediate network egress request monitoring makes a lot of sense_ - [Liran Tal](https://stars.github.com/profiles/lirantal/), GitHub Star, and Author of Essential Node.js Security

> _Harden-Runner strikes an elegant balance between ease-of-use, maintainability, and mitigation that I intend to apply to all of my 300+ npm packages. I look forward to the tool’s improvement over time_ - [Jordan Harband](https://github.com/ljharb), Open Source Maintainer

> _Harden runner from Step security is such a nice solution, it is another piece of the puzzle in helping treat the CI environment like production and solving supply chain security. I look forward to seeing it evolve._ - Cam Parry, Staff Site Reliability Engineer, Kapiche

## Workflows using harden-runner

Some important workflows using harden-runner:
| |Repository |Link to insights|
|--|----------|----------------|
|1.|[nvm-sh/nvm](https://github.com/nvm-sh/nvm/blob/master/.github/workflows/lint.yml)|[Link to insights](https://app.stepsecurity.io/github/nvm-sh/nvm/actions/runs/1757959262)|
|2.|[yannickcr/eslint-plugin-react](https://github.com/yannickcr/eslint-plugin-react/blob/master/.github/workflows/release.yml)|[Link to insights](https://app.stepsecurity.io/github/yannickcr/eslint-plugin-react/actions/runs/1930818585)
|3.|[microsoft/msquic](https://github.com/microsoft/msquic/blob/main/.github/workflows/docker-publish.yml)|[Link to insights](https://app.stepsecurity.io/github/microsoft/msquic/actions/runs/1759010243)
|4.|[ossf/scorecard](https://github.com/ossf/scorecard/blob/main/.github/workflows/codeql-analysis.yml)|[Link to insights](https://app.stepsecurity.io/github/ossf/scorecard/actions/runs/2006162141)
|5.|[Automattic/vip-go-mu-plugins](https://github.com/Automattic/vip-go-mu-plugins/blob/master/.github/workflows/e2e.yml)|[Link to insights](https://app.stepsecurity.io/github/Automattic/vip-go-mu-plugins/actions/runs/1758760957)

## 1-minute Demo Video

https://user-images.githubusercontent.com/25015917/156026587-79356450-9b35-4254-9c2e-7f2cc8d81059.mp4
