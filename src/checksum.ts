import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "86d042adcdc03eb1ea50d35d265da47622a6d0aedef9657f84ce1eb7f04d6057", // v1.8.0
    arm64: "ea1074a2358d50db9a9fe18ae3971b87305cda63f262c494a5f43b25f4e524ce",
  },
  non_tls: {
    amd64: "4aaaeebbe10e619d8ce13e8cc4a1acbafc8f891e8cdd319984480b9ec08407b8", // v0.15.0
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
