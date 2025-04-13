import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "3fdf9e0b0f08e39768dd2bb0c55d02c628c0670e3529c2f440bbb1da8a3d80f4", // v1.6.1
    arm64: "67405f212088d2891f4e40c7004b850b80e302fb1d9066e8c651de8b14679c55",
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
