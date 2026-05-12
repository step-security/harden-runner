import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export const CHECKSUMS = {
  tls: {
    amd64: "050af506ca0a64e7d478e9e80719042f3f9f0aa0a35e3b8d610c4ef6c759822e", // v1.8.5
    arm64: "60726403ea552a0f3148137b8ee77c7a4a12f7fde8639cb15686d2ff35834d58",
  },
  non_tls: {
    amd64: "e38de61e1afd98dd339bb9acce4996183875d482be1638fb198ab02b3e25bbef", // v0.16.0
  },
  bravo: {
    amd64: "e91efce9def2a73193c6caddb89f56898d2bcbf3fff3ecd8c49fac33b15736e2", // v1.8.5
    arm64: "12345185744d7f2626d1f1aa1e6dbee460a41bea6520dd6f93058635c98376ab",
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
