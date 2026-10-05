import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export const CHECKSUMS = {
  tls: {
    amd64: "2d052e2373a412b342480019f5cf847f84a2f9f8aca86a15acab2e8c3152beb9", // v1.9.3
    arm64: "4918db19e07a7b511aea665c7b808c72cd1be9cd9ea4deb41b4d6f41f702e5e7", // v1.9.3
  },
  non_tls: {
    amd64: "e0faa2687554ebd5629595bcd5531360781abe3e2746ef8ce5a030961a3acab0", // v0.17.0
    arm64: "6b5739247c06179a280f2f9548dd3337d839d3cc83284b75ddbdd593ac1ea0d6", // v0.17.0
  },
  bravo: {
    amd64: "995c1157c2764d2b09ba369fc2583104096cfb9a40c09af4b00b77e32651216b", // v1.9.3
    arm64: "f52555c8ab659a8a9b870fd3b8e820c064e235e3c34e83adf30db4b46e6a2efb", // v1.9.3
  },
  darwin: "da83f8b446067b9db72aa896f6cec71f1a073015bcf585e63a1d9e0a14c21910", // v0.0.7
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
