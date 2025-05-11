import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "8fc633c62cf1131bd14c865a2d2f20ed53079e5a5f92fa67b1151550c4530edb", // v1.6.5
    arm64: "1f84c24fc0caecab1765fabb575f7eccb1ee75601163258435cdb253725ae0a4",
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
