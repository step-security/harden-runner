import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export function verifyChecksum(downloadPath: string, is_tls: boolean) {
  const fileBuffer: Buffer = fs.readFileSync(downloadPath);
  const checksum: string = crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("hex"); // checksum of downloaded file

  let expectedChecksum: string =
    "a9f1842e3d7f3d38c143dbe8ffe1948e6c8173cd04da072d9f9d128bb400844a"; // checksum for v0.13.7

  if (is_tls) {
    expectedChecksum =
      "74dbe0fb19e2792aab332c434a059e8cb44005ffe1a1594bf29612f219514af4"; // checksum for tls_agent
  }

  if (checksum !== expectedChecksum) {
    core.setFailed(
      `Checksum verification failed, expected ${expectedChecksum} instead got ${checksum}`
    );
  }

  core.debug("Checksum verification passed.");
}
