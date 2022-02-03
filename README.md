<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/Final-Logo-06.png" alt="Step Security Logo" width="340">
</p>

# Security monitoring for the GitHub-hosted runner

[![Slack](https://img.shields.io/badge/Join%20the%20Community-Slack-blue)](https://join.slack.com/t/stepsecuritygroup/shared_invite/zt-11q5o2icy-9xuW51dJWQffFVl3DX98BQ)

If you have a self-hosted build server (e.g. Cloud VM), you may have security monitoring implemented on it. When you use GitHub Actions hosted-runner, you can use `harden-runner` to add security controls and monitoring to the build server (Ubuntu VM) on which GitHub Actions runs your workflows. Unlike traditional monitoring for Cloud VMs, `harden-runner` insights and policy are granular per job of a workflow. 

## Prevent DNS exfiltration and exfiltration of credentials
First-of-its-kind patent-pending technology that automatically correlates outbound traffic with each step of a workflow.

1. Add `step-security/harden-runner` to your GitHub Actions workflow file as the first step. 

    ```
    steps:
      - uses: step-security/harden-runner@14dc64f30986eaa2ad2dddcec073f5aab18e5a24 # v1
        with:
          egress-policy: audit
    ```

2. In the workflow logs, you will see a link to security insights and recommendations.  

    <p align="left">
      <img src="https://github.com/step-security/supply-chain-goat/blob/main/images/InsightsLink.png" alt="Link in build log" >
    </p>

3. Click on the link ([example link](https://app.stepsecurity.io/github/jauderho/dockerfiles/actions/runs/1736506434)). You will see outbound traffic made by each step.

    <p align="left">
      <img src="https://step-security-images.s3.us-west-2.amazonaws.com/insights3.png" alt="Insights from harden-runner" >
    </p>
    <p align="left">
      <img src="https://step-security-images.s3.us-west-2.amazonaws.com/recommended-policy.png" alt="Policy recommended by harden-runner" >
    </p>

4. Add the recommended outbound endpoints to your workflow file, and only traffic to these endpoints will be allowed.

   ```
    steps:
      - uses: step-security/harden-runner@14dc64f30986eaa2ad2dddcec073f5aab18e5a24 # v1
        with:
          egress-policy: block
          allowed-endpoints: 
            api.github.com:443
            github.com:443
            pypi.org:443
    ```

## Try it out

[Hands-on tutorials](https://github.com/step-security/supply-chain-goat) to learn how `harden-runner` would have prevented past software supply chain attacks, such as the Codecov breach.

## Workflows using harden-runner

Workflows using harden-runner:
1. https://github.com/nvm-sh/nvm/tree/master/.github/workflows ([link to insights](https://app.stepsecurity.io/github/nvm-sh/nvm/actions/runs/1757959262))
2. https://github.com/microsoft/msquic/tree/main/.github/workflows ([link to insights](https://app.stepsecurity.io/github/microsoft/msquic/actions/runs/1759010243))
3. https://github.com/Automattic/vip-go-mu-plugins/blob/master/.github/workflows/e2e.yml ([link to insights](https://app.stepsecurity.io/github/Automattic/vip-go-mu-plugins/actions/runs/1758760957))
4. https://github.com/MTRNord/matrix-art/tree/main/.github/workflows ([link to insights](https://app.stepsecurity.io/github/MTRNord/matrix-art/actions/runs/1758933417))
5. https://github.com/jauderho/dockerfiles/blob/main/.github/workflows/age.yml ([link to insights](https://app.stepsecurity.io/github/jauderho/dockerfiles/actions/runs/1758047950))

## Discussions

If you have questions, please use [discussions](https://github.com/step-security/harden-runner/discussions). 
1. [Support for private repositories](https://github.com/step-security/harden-runner/discussions/74)
2. [Generation of accurate SBOM (software bill of materials)](https://github.com/step-security/harden-runner/discussions/75)
