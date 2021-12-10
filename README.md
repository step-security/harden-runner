<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/Final-Logo-06.png" alt="Step Security Logo" width="340">
</p>

# Policy-based Runtime Security for GitHub Actions

First-of-its-kind patent-pending technology that automatically correlates outbound traffic with each step of a workflow.

1. Add this code to your GitHub Actions workflow file as the first step. 

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

3. Click on the link ([example link](https://app.stepsecurity.io/github/nvm-sh/nvm/actions/runs/1547131792)). 

<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/insights.png" alt="Step Security Logo" >
</p>
<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/policy.png" alt="Step Security Logo" >
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