import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export const CHECKSUMS = {
  tls: {
    amd64: "a54c4305b5665ba54bfdc46eb32aee1758699b994550ca3658d698367cc96a3f", // v1.8.12
    arm64: "3f401d508e1427b9ba205681d5abecde3b4a0f0a18542d198b6dc14cadd93ab5", // v1.8.12
  },
  non_tls: {
    amd64: "e38de61e1afd98dd339bb9acce4996183875d482be1638fb198ab02b3e25bbef", // v0.16.0
  },
  bravo: {
    amd64: "c986d0a19637325c9a8d4a331a6c4ed047e4cddb798f56b641d0e66f8bf9b1b2", // v1.8.12
    arm64: "5c3df17f82e317c8b288dfbbcee449c2a24a80deeeb3416dccabd0a61982c676", // v1.8.12
  },
  darwin: "2990f0390d2760fa6262a3830060b6db1233f16a1410ffe1ed2bf13dfda80c38", // v0.0.6
  windows: {
    amd64: "5e3604d08aba65d7bdd1d0684826d5894ffb0c6f56b914c6ecb35c3271e04483", // v1.0.7
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
