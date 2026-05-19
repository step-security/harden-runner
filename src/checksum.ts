import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export const CHECKSUMS = {
  tls: {
    amd64: "d58a9c1c5245155ce4c71507a61e213a29925a7c39c0d20bfd00bef0d281bdbb", // v1.8.6
    arm64: "084fa95e74d17321dd1c37c93abeb8577e53ddf5266410e19f52aa79a02ae33e",
  },
  non_tls: {
    amd64: "e38de61e1afd98dd339bb9acce4996183875d482be1638fb198ab02b3e25bbef", // v0.16.0
  },
  bravo: {
    amd64: "495f607a891d89f12214849301f247bdca565afe67deb170fe7e5d6d361852ca", // v1.8.6
    arm64: "f96f66ab946097aae1fc887e12fe1cefcc5d510bce179221c7185374e4adf538",
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
