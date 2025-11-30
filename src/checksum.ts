import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "ed6a04f39d18f030a80b949228ac9117e63e410eac3142cdc4a7d84109a75385", // v1.7.8
    arm64: "dc1a759ea585b795a01a41f6a7624ee7a5243eb1b7ce0858f458de9f84a51b69",
  },
  non_tls: {
    amd64: "336093af8ebe969567b66fd035af3bd4f7e1c723ce680d6b4b5b2a1f79bc329e", // v0.14.2
  },
};

export function verifyChecksum(
  downloadPath: string,
  isTLS: boolean,
  variant: string
) {
  const fileBuffer: Buffer = fs.readFileSync(downloadPath);
  const checksum: string = crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("hex"); // checksum of downloaded file

  let expectedChecksum: string = "";

  if (isTLS) {
    expectedChecksum = CHECKSUMS["tls"][variant];
  } else {
    expectedChecksum = CHECKSUMS["non_tls"][variant];
  }

  if (checksum !== expectedChecksum) {
    core.setFailed(
      `Checksum verification failed, expected ${expectedChecksum} instead got ${checksum}`
    );
  }

  core.debug("Checksum verification passed.");
}
