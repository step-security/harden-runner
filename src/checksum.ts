import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export const CHECKSUMS = {
  tls: {
    amd64: "66f309e8fa41aa6b96a5e740afccefa3b89e90fb62180cdbe73948f3bc068f57", // v1.9.4
    arm64: "15ff7e107988333f22eb93f33ca35630c48de3fd969938bc72e0e10e7808aab9", // v1.9.4
  },
  non_tls: {
    amd64: "e0faa2687554ebd5629595bcd5531360781abe3e2746ef8ce5a030961a3acab0", // v0.17.0
    arm64: "6b5739247c06179a280f2f9548dd3337d839d3cc83284b75ddbdd593ac1ea0d6", // v0.17.0
  },
  bravo: {
    amd64: "c2baada041a36be6179c1467f04fd40d429e9fb0523752426f8290d03a087f51", // v1.9.4
    arm64: "d903b31dcc563f0d21c85cdceae9161c97da6a5b4cfa7637d8480cd03885ecc1", // v1.9.4
  },
  darwin: "0e0964799818e8a63cf785bb00d70c3b1eeb9d0d0bfbcace364be7a469ee13aa", // v0.0.9
  windows: {
    amd64: "1fada923697ec6bcfd64ac29f0751fe92861d269de073af4aa79b5bf6e2b4071", // v1.0.10
  },
};

// verifyChecksum returns true if checksum is valid
export function verifyChecksum(
  downloadPath: string,
  isTLS: boolean,
  variant: string,
  platform: string,
  agentType: "default" | "bravo" = "default"
) {
  const fileBuffer: Buffer = fs.readFileSync(downloadPath);
  const checksum: string = crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("hex"); // checksum of downloaded file

  let expectedChecksum: string = "";

  switch (platform) {
    case "linux":
      if (agentType === "bravo") {
        expectedChecksum = CHECKSUMS["bravo"][variant];
      } else {
        expectedChecksum = isTLS
          ? CHECKSUMS["tls"][variant]
          : CHECKSUMS["non_tls"][variant];
      }
      break;
    case "darwin":
      expectedChecksum = CHECKSUMS["darwin"];
      break;
    case "win32":
      expectedChecksum = CHECKSUMS["windows"][variant];
      break;
    default:
      console.log(`Unsupported platform: ${platform}`);
      return false;
  }

  if (checksum !== expectedChecksum) {
    core.setFailed(
      `❌ Checksum verification failed, expected ${expectedChecksum} instead got ${checksum}`
    );
    return false;
  }

  core.info(`✅ Checksum verification passed. checksum=${checksum}`);
  return true;
}
