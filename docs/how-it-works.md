## How Harden-Runner Works?

### GitHub-Hosted Runners

For GitHub-hosted runners, Harden-Runner GitHub Action downloads and installs the StepSecurity Agent.

- The code to monitor file, process, and network activity is in the Agent.
- The community tier agent for Linux is open-source and can be found [here](https://github.com/step-security/agent). The enterprise agent for Linux and agents for Windows and macOS are closed-source.

### Self-Hosted Actions Runner Controller (ARC) Runners

- ARC Harden Runner daemonset uses eBPF
- You can find more details in this [blog post](https://www.stepsecurity.io/blog/introducing-harden-runner-for-kubernetes-based-self-hosted-actions-runners)
- ARC Harden Runner is NOT open source.

### Self-Hosted VM Runners (e.g. on EC2)

- For self-hosted VMs, you add the Harden-Runner agent into your runner image (e.g. AMI).
- You can find more details in this [blog post](https://www.stepsecurity.io/blog/ci-cd-security-for-self-hosted-vm-runners)
- Agent for self-hosted VMs is NOT open source.