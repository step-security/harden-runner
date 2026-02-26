import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "d92e2d3ad0d451dfddc082c10690fb69472df9e45f6d9b37b0e6fe374bd6569f", // v1.7.12
    arm64: "84ff11038212d5143447619a3b5457b58dd196cad94f987154f11bd6cd6a5fb0",
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
