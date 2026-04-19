import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export const CHECKSUMS = {
  tls: {
    amd64: "713c91e921292027dacf446db44bafbc8e36a3f7f51dff664ba681c6e4398a05", // v1.8.2
    arm64: "2c1eb365d6d9ae4cd4b6632a5f833bcdb7e75d0d9604de3391ff22e4e28e8d42",
  },
  non_tls: {
    amd64: "e38de61e1afd98dd339bb9acce4996183875d482be1638fb198ab02b3e25bbef", // v0.16.0
  },
  bravo: {
    amd64: "8d002af0c1c4bb73eaef0f2b641f7aa353cc3f4da36a4e418b69895a2baa922c", // v1.8.2
    arm64: "1ce74a30d704c2e994246fc809d65af83e3f354aae7b9080b2c2eaee715cf005",
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
