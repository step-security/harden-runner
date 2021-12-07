<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/Final-Logo-06.png" alt="Step Security Logo" width="340">
</p>

# Harden Runner

First-of-its-kind technology that automatically discovers and correlates outbound traffic with each step of a GitHub Actions workflow.

To use this GitHub Action, add the following code to your GitHub Actions workflow file as the first step. 

```
steps:
    - uses: step-security/harden-runner@v1
      with:
        egress-policy: audit
```

In the workflow logs, you should see a link to security insights and recommendations.  

<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/build_log_link.png" alt="Link in build log" >
</p>

Click on the link ([example link](https://app.stepsecurity.io/github/nvm-sh/nvm/actions/runs/1547131792)) to view security insights and recommended egress policy (example below). 

<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/insights.png" alt="Step Security Logo" >
</p>
<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/policy.png" alt="Step Security Logo" >
</p>

You can then add the correlated outbound endpoints to your workflow file, and only traffic to these endpoints will be allowed, thereby reducing risk from software supply chain attacks.
