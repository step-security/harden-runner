<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/Final-Logo-06.png" alt="Step Security Logo" width="340">
</p>

# Security monitoring for the GitHub-hosted runner

If you have a self-hosted build server (e.g. Cloud VM), you may have security monitoring implemented on it. When you use GitHub Actions hosted-runner, you can use `harden-runner` to add security controls and monitoring to the build server (Ubuntu VM) on which GitHub Actions runs your workflows.

## Prevent DNS exfiltration and exfiltration of credentials
First-of-its-kind patent-pending technology that automatically correlates outbound traffic with each step of a workflow.

1. Add `step-security/harden-runner@v1` to your GitHub Actions workflow file as the first step. 

    ```
    steps:
      - uses: step-security/harden-runner@v1
          with:
            egress-policy: audit
      - uses: actions/checkout@v2
    ```

2. In the workflow logs, you will see a link to security insights and recommendations.  

<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/build_log_link.png" alt="Link in build log" >
</p>

3. Click on the link ([example link](https://app.stepsecurity.io/github/nvm-sh/nvm/actions/runs/1547131792)). You will see outbound traffic made by each step.

<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/insights1.png" alt="Insights from harden-runner" >
</p>
<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/policy.png" alt="Policy recommended by harden-runner" >
</p>

4. Add the recommended outbound endpoints to your workflow file, and only traffic to these endpoints will be allowed.

   ```
    steps:
      - uses: step-security/harden-runner@v1
        with:
          allowed-endpoints:
            github.com:443
            nodejs.org:443
            registry.npmjs.org:443
      - uses: actions/checkout@v2
    ```

## Workflows using harden-runner

Workflows using harden-runner:
1. https://github.com/nvm-sh/nvm/tree/master/.github/workflows
2. https://github.com/shivammathur/setup-php/blob/master/.github/workflows/node-release.yml
3. https://github.com/microsoft/msquic/tree/main/.github/workflows
4. https://github.com/dassana-io/dassana/blob/main/.github/workflows/publish-ut-coverage.yaml
5. https://github.com/MTRNord/matrix-art/tree/main/.github/workflows

## Try it out

[Hands-on tutorials](https://github.com/step-security/supply-chain-goat) to learn how `harden-runner` prevents software supply chain attacks.
