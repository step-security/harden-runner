import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export const CHECKSUMS = {
  tls: {
    amd64: "b4efa8356de128c3daba6a7e334779877faafb08b49f9a4ef4152826c66ff4c2", // v1.9.1
    arm64: "0e93ad693d562448fd62e322c8e165caba3de123c9cd631e2bdc2d4dbb4e091a", // v1.9.1
  },
  non_tls: {
    amd64: "4fca42590557ad92e50bd99cf81eba527d0699ac05dd11dfb0c795f48ae63e26", // v0.16.3
  },
  bravo: {
    amd64: "59ea6f0a488514b2d3feaf5b98fb445af9d2875f32acf5878d84c72e835a3425", // v1.9.1
    arm64: "0b1544370b89adee80f71cc0e9bed6dcc46fe3aa410338f9a305b892a194ebb8", // v1.9.1
  },
  darwin: "2990f0390d2760fa6262a3830060b6db1233f16a1410ffe1ed2bf13dfda80c38", // v0.0.6
  windows: {
    amd64: "1fada923697ec6bcfd64ac29f0751fe92861d269de073af4aa79b5bf6e2b4071", // v1.0.10
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
