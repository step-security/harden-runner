import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "3e17e3c47573f22960f8899a9d21d435ff45569d1947bd00be3b2de1517788e6", // v1.6.12
    arm64: "ce080ea5436da5d7fb8071aed24ef19bbc72050891e422ae208ff2127a0f7d55",
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
