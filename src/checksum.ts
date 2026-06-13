import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export const CHECKSUMS = {
  tls: {
    amd64: "614c0cd8d873c28fe30cf2e6a7c12f751802966ac766029fc5a4ca8cfd474eaf", // v1.8.9
    arm64: "6dd323fd5716aba5a27a942618f0c5ce63576a682d4c943b04c5bb13f1adaf44",
  },
  non_tls: {
    amd64: "e38de61e1afd98dd339bb9acce4996183875d482be1638fb198ab02b3e25bbef", // v0.16.0
  },
  bravo: {
    amd64: "572488e4e3fd82c5883841986a4a73c9f22183fe01f65ed03aa7493941898dfc", // v1.8.9
    arm64: "44605f788a06c4cd38dbfb39513cae54e13524146681c805f439f656c9641d79",
  },
  darwin: "fe26a1f6af4afe9f1a854d8633832f5d18ab542827003cae445b3a64021d612c", // v0.0.5
  windows: {
    amd64: "93f1e5d87c6647e6eca7963d5f4b4bd73107029430f8e6945ffece93007a89f5", // v1.0.2
  },
};

// verifyChecksum returns true if checksum is valid
export function verifyChecksum(
  downloadPath: string,
  isTLS: boolean,
  variant: string,
  platform: string,
  agentType: "default" | "bravo" = "default"
) {
  const fileBuffer: Buffer = fs.readFileSync(downloadPath);
  const checksum: string = crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("hex"); // checksum of downloaded file

  let expectedChecksum: string = "";

  switch (platform) {
    case "linux":
      if (agentType === "bravo") {
        expectedChecksum = CHECKSUMS["bravo"][variant];
      } else {
        expectedChecksum = isTLS
          ? CHECKSUMS["tls"][variant]
          : CHECKSUMS["non_tls"][variant];
      }
      break;
    case "darwin":
      expectedChecksum = CHECKSUMS["darwin"];
      break;
    case "win32":
      expectedChecksum = CHECKSUMS["windows"][variant];
      break;
    default:
      console.log(`Unsupported platform: ${platform}`);
      return false;
  }

  if (checksum !== expectedChecksum) {
    core.setFailed(
      `❌ Checksum verification failed, expected ${expectedChecksum} instead got ${checksum}`
    );
    return false;
  }

  core.info(`✅ Checksum verification passed. checksum=${checksum}`);
  return true;
}
