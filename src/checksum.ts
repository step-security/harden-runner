import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "6941b2abc4209f73470359c9599b54d2f3a3c86691873240d04f0fa9b2315892", // v1.3.1
    arm64: "bf7041e54ec6e6fa8abbdc8f79388dfa15d16cc5edc42c7103a7e15b5db0e88a",
  },
  non_tls: {
    amd64: "a9f1842e3d7f3d38c143dbe8ffe1948e6c8173cd04da072d9f9d128bb400844a", // v0.13.7
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
