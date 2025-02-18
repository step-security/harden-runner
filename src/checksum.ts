import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "38e7ed97ced6fe0c1cf0fb5ee3b3d521dfe28d5ddf1cdca72d130c8d1b4a314e", // v1.4.2
    arm64: "f67c80cc578c996d4f882c14fcdb63df57927d907cd22f1ec65f9fa940c08cf3",
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
