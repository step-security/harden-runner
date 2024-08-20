import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "a37a8dc6b93ae5bc83cfed2c7e8b9f4034fec067ef977f31ab98c255837815ee", // v1.3.0
    arm64: "dcac3df8bb633d2230f15a3fc4dc9f01418d0a076eb9594c6b941cf768ede2d6",
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
