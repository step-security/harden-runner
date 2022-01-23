<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/Final-Logo-06.png" alt="Step Security Logo" width="340">
</p>

# Security monitoring for the GitHub-hosted runner

[![Slack](https://img.shields.io/badge/Join%20the%20Community-Slack-blue)](https://join.slack.com/t/stepsecuritygroup/shared_invite/zt-11q5o2icy-9xuW51dJWQffFVl3DX98BQ)

If you have a self-hosted build server (e.g. Cloud VM), you may have security monitoring implemented on it. When you use GitHub Actions hosted-runner, you can use `harden-runner` to add security controls and monitoring to the build server (Ubuntu VM) on which GitHub Actions runs your workflows.

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
      <img src="https://step-security-images.s3.us-west-2.amazonaws.com/build_log_link1.png" alt="Link in build log" >
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

[Hands-on tutorials](https://github.com/step-security/supply-chain-goat) to learn how `harden-runner` prevents software supply chain attacks.

## Workflows using harden-runner

Workflows using harden-runner:
1. https://github.com/nvm-sh/nvm/tree/master/.github/workflows
2. https://github.com/microsoft/msquic/tree/main/.github/workflows
3. https://github.com/dassana-io/dassana/blob/main/.github/workflows/publish-ut-coverage.yaml
4. https://github.com/MTRNord/matrix-art/tree/main/.github/workflows
5. https://github.com/jauderho/dockerfiles/blob/main/.github/workflows/linter.yml
6. https://github.com/myrotvorets/opentelemetry-plugin-knex/blob/master/.github/workflows/package-audit.yml

## Support for private repositories

`harden-runner` does not work for and show insights for private repositories as of now. Support will be added in the future. 
