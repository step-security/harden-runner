<p align="left">
  <img src="https://step-security-images.s3.us-west-2.amazonaws.com/Final-Logo-06.png" alt="Step Security Logo" width="340">
</p>

# Harden GitHub Actions Hosted Runner

This GitHub Action deploys the [Step Security Agent](https://github.com/step-security/agent), which is a purpose-built security agent for hosted runners.

To pilot this GitHub Action, add the following code to your GitHub Actions workflow file as the first step. This is the only step needed.

```
steps:
    - uses: step-security/harden-runner@main
```

In the workflow logs, you should see a link to security insights and recommendations.

It is being piloted on [this](https://github.com/shivammathur/setup-php) repository. Check out the [workflow files](https://github.com/shivammathur/setup-php/blob/2f5c2edb229fb5b3dcaeb535cb83899b41854672/.github/workflows/node-workflow.yml#L30) and [workflow runs](https://github.com/shivammathur/setup-php/runs/4252355681?check_suite_focus=true#step:3:4).


