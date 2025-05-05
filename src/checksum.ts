import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "269ca810d6179dad30eecd3ebae8fcb73239afed706cb4af777cbe1d34e834ce", // v1.6.4
    arm64: "f39dba7e3275081e2c6bc22baa7fc2bf28cc967bfc333df56792a5c70c74ae5d",
  },
  non_tls: {
    amd64: "15f639d0e58cf687e28a26fb48fc1e17fab81baceaa7d2d50ca8c465d98d13cd", // v0.14.1
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
