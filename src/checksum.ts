import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "19c35eee1347077eb71306b122ad4a1cf83f36ef0f69fd91b0c0d79ffd0eabdd", // v1.7.10
    arm64: "f9192788e86b2e44b795f072e8cc03eec9852649609aeedac0761d3b67c991fa",
  },
  non_tls: {
    amd64: "23715f2485c16e2a2ad116abf0fe8443788c62e4f5f224c5858b0b41b591fc89", // v0.14.3
  },
  darwin: "c15dea4604bb3f15c7b45bf74658a154827d3c1285cb9b13f21d4a2ad2b9d9ce", // v0.0.3
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
