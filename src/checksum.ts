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
      "29f6c8414f9f0e0a4cb9510b8f349a7ecfee33622dd1b74dd57256f901b256ae"; // checksum for tls_agent
  }

  if (checksum !== expectedChecksum) {
    core.setFailed(
      `Checksum verification failed, expected ${expectedChecksum} instead got ${checksum}`
    );
  }

  core.debug("Checksum verification passed.");
}
