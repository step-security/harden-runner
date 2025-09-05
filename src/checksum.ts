import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "57b2ca0b5eaf979ebbee8870b949a463e6e1c3ed7556c70caa76191e2430d72a", // v1.6.22
    arm64: "babb17200504f27f6b32ee7522ea52c3b9f77913dfda83afa0087d48623449d3",
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
