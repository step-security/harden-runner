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
    "ceb925c78e5c79af4f344f08f59bbdcf3376d20d15930a315f9b24b6c4d0328a"; // checksum for v0.13.5

  if (is_tls) {
    expectedChecksum =
      "e0cd0f0da1ac48df713acd8c4f0e591274de0f2c251b8526cf956c654f024ec2"; // checksum for tls_agent
  }

  if (checksum !== expectedChecksum) {
    core.setFailed(
      `Checksum verification failed, expected ${expectedChecksum} instead got ${checksum}`
    );
  }

  core.debug("Checksum verification passed.");
}
