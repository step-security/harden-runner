import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "e7c0c5f96efbf96806d27dcbf65f71f72ecd34cdd596c556bb2ded0f2037c260", // v1.6.3
    arm64: "813a4cd40f6740bd9623a40884a78f14960c6bd3794391693a165f2ca71c90e3",
  },
  non_tls: {
    amd64: "f0a8bb49ce5480744f8c836af2abd5f311e918efef5b36b4cce7521d7b9dffe6", // v0.14.0
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
