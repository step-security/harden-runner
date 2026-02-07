import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "19c35eee1347077eb71306b122ad4a1cf83f36ef0f69fd91b0c0d79ffd0eabdd", // v1.7.10
    arm64: "f9192788e86b2e44b795f072e8cc03eec9852649609aeedac0761d3b67c991fa",
  },
  non_tls: {
    amd64: "23715f2485c16e2a2ad116abf0fe8443788c62e4f5f224c5858b0b41b591fc89", // v0.14.3
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
