import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export function verifyChecksum(downloadPath: string) {
  const fileBuffer: Buffer = fs.readFileSync(downloadPath);
  const checksum: string = crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("hex"); // checksum of downloaded file

  const expectedChecksum: string =
    "a0589337551f09b36c65392582f573ad6be14d1f96763a8e6179ea548c912613"; // checksum for v0.13.3

  if (checksum !== expectedChecksum) {
    core.setFailed(
      `Checksum verification failed, expected ${expectedChecksum} instead got ${checksum}`
    );
  }

  core.debug("Checksum verification passed.");
}
