import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "2a5be06ab620340f6957ddd180450caab414671c8b7da1996d8e2755c1cd49fa", // v1.7.9
    arm64: "e9d0ccf3e4e62ba15ff208ef6e0afa0ad5e323c3dfc50527342f436a85e65a55",
  },
  non_tls: {
    amd64: "336093af8ebe969567b66fd035af3bd4f7e1c723ce680d6b4b5b2a1f79bc329e", // v0.14.2
  },
  windows: {
    amd64: "4ce2409d5802e947b563e29dbd8e803525dc78b21996b0ecedb51ceb046911a3", // v1.0.0-int
  },
};

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
    case "win32":
      expectedChecksum = CHECKSUMS["windows"][variant];
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }

  if (checksum !== expectedChecksum) {
    core.setFailed(
      `Checksum verification failed, expected ${expectedChecksum} instead got ${checksum}`
    );
  }

  core.debug("Checksum verification passed.");
}
