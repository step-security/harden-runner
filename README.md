<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/Final-Logo-06.png" alt="Step Security Logo" width="340">
</p>

# Software Supply Chain Security

This GitHub Action can be used to prevent certain types of software supply chain attacks.  

## Problem
Hijacked dependencies and compromised build tools typically make outbound requests during the build process to exfiltrate data or credentials. This was the case in the [Codecov breach](https://www.bleepingcomputer.com/news/security/popular-codecov-code-coverage-tool-hacked-to-steal-dev-credentials/), in the [dependency confusion attacks](https://medium.com/@alex.birsan/dependency-confusion-4a5d60fec610), and the recent [npm package hijacks](https://github.com/faisalman/ua-parser-js/issues/536).

## Solution
First-of-its-kind patent-pending technology that automatically correlates outbound traffic with each step of a workflow.

1. Add `step-security/harden-runner` to your GitHub Actions workflow file as the first step. 

    ```yaml
    steps:
      - uses: step-security/harden-runner@bdb12b622a910dfdc99a31fdfe6f45a16bc287a4 # v1
        with:
          egress-policy: audit
    ```

2. In the workflow logs, you will see a link to security insights and recommendations.  

    <p align="left">
      <img src="https://github.com/step-security/supply-chain-goat/blob/main/images/harden-runner/ActionLog.png" alt="Link in build log" >
    </p>

3. Click on the link ([example link](https://app.stepsecurity.io/github/jauderho/dockerfiles/actions/runs/1736506434)). You will see outbound traffic made by each step.

    <p align="left">
      <img src="https://github.com/step-security/supply-chain-goat/blob/main/images/harden-runner/OutboundCall.png" alt="Insights from harden-runner" >
    </p>
    
4. Below the insights, you will see the recommended policy. Add the recommended outbound endpoints to your workflow file, and only traffic to these endpoints will be allowed.  
    
    <p align="left">
      <img src="https://github.com/step-security/supply-chain-goat/blob/main/images/harden-runner/RecomPolicy1.png" alt="Policy recommended by harden-runner" >
    </p>
  
  When you use `egress-policy: block` mode, you can also set `disable-telemetry: true` to not send telemetry to the StepSecurity API.
  
## How past attacks would have been prevented

[Hands-on tutorials](https://github.com/step-security/supply-chain-goat) to learn how `harden-runner` would have prevented past software supply chain attacks.

## Support for private repositories
Install the [Harden Runner App](https://github.com/marketplace/harden-runner-app) if you want to use `harden-runner` for `Private` repositories. This App only needs `actions: read` permissions on your repositories. You can install it on selected repositories, or all repositories in your organization. 

## Discussions

If you have questions or ideas, please use [discussions](https://github.com/step-security/harden-runner/discussions). 
1. [Support for private repositories](https://github.com/step-security/harden-runner/discussions/74)
2. [Generation of accurate SBOM (software bill of materials)](https://github.com/step-security/harden-runner/discussions/75)
3. [SLSA Level 1](https://github.com/step-security/harden-runner/discussions/93)
4. [Cryptographically verify tools run as part of the CI/ CD pipeline](https://github.com/step-security/harden-runner/discussions/94)

## Testimonials

> *I think this is a great idea and for the threat model of build-time, an immediate network egress request monitoring makes a lot of sense* - [Liran Tal](https://stars.github.com/profiles/lirantal/), GitHub Star, and Author of Essential Node.js Security

> *Harden-Runner strikes an elegant balance between ease-of-use, maintainability, and mitigation that I intend to apply to all of my 300+ npm packages. I look forward to the tool’s improvement over time* - [Jordan Harband](https://github.com/ljharb), Open Source Maintainer

> *Harden runner from Step security is such a nice solution, it is another piece of the puzzle in helping treat the CI environment like production and solving supply chain security. I look forward to seeing it evolve.* - Cam Parry, Senior Site Reliability Engineer, Kapiche

## Workflows using harden-runner

Workflows using harden-runner:
1. https://github.com/nvm-sh/nvm/tree/master/.github/workflows ([link to insights](https://app.stepsecurity.io/github/nvm-sh/nvm/actions/runs/1757959262))
2. https://github.com/microsoft/msquic/tree/main/.github/workflows ([link to insights](https://app.stepsecurity.io/github/microsoft/msquic/actions/runs/1759010243))
3. https://github.com/Automattic/vip-go-mu-plugins/blob/master/.github/workflows/e2e.yml ([link to insights](https://app.stepsecurity.io/github/Automattic/vip-go-mu-plugins/actions/runs/1758760957))
4. https://github.com/MTRNord/matrix-art/tree/main/.github/workflows ([link to insights](https://app.stepsecurity.io/github/MTRNord/matrix-art/actions/runs/1758933417))
5. https://github.com/jauderho/dockerfiles/blob/main/.github/workflows/age.yml ([link to insights](https://app.stepsecurity.io/github/jauderho/dockerfiles/actions/runs/1758047950))

## 1-minute Demo Video

https://user-images.githubusercontent.com/25015917/156026587-79356450-9b35-4254-9c2e-7f2cc8d81059.mp4

## FAQ

### Why do I see calls to `api.snapcraft.io`?

During pilot, it was observed that unnecessary outbound calls were being made to some domains. All of the outbound calls were due to unnecessary services running on the GitHub Actions hosted-runner VM. These services have been stopped, except for `snapd`, which makes calls to `api.snapcraft.io`. You can read more about this issue [here](https://github.com/actions/virtual-environments/issues/4867). `api.snapcraft.io` is not needed for your workflow, and does not need to be added to the `allowed-endpoints` list. 

