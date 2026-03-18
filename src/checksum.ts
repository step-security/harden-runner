import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "30fca1b76d21361e4976e763e15dc939a40d9aea3b009a799af185a5344aafa7", // v1.7.14
    arm64: "766e04e216300240a577402ddea659887b22b43bcd5d436d868d0802db4a3a77",
  },
  non_tls: {
    amd64: "1531bda40026b799b0704d0f775c372653a91fe436628fa8b416849d9c0707a8", // v0.14.4
  },
  darwin: "797399a3a3f6f9c4c000a02e0d8c7b16499129c9bdc2ad9cf2a10072c10654fb", // v0.0.4
  windows: {
    amd64: "e98f8b9cf9ecf6566f1e16a470fbe4aef01610a644fd8203a1bab3ff142186c8", // v1.0.0
  },
};

// verifyChecksum returns true if checksum is valid
export function verifyChecksum(
  downloadPath: string,
  isTLS: boolean,
  variant: string,
  platform: string
) {
  const fileBuffer: Buffer = fs.readFileSync(downloadPath);
  const checksum: string = crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("hex"); // checksum of downloaded file

  let expectedChecksum: string = "";

  switch (platform) {
    case "linux":
      expectedChecksum = isTLS
        ? CHECKSUMS["tls"][variant]
        : CHECKSUMS["non_tls"][variant];
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
