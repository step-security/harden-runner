import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export const CHECKSUMS = {
  tls: {
    amd64: "c794a3ee8ba799519ebc718adec5b9ae79ad3ea6a48aa5a4a80cb19434766463", // v1.9.6
    arm64: "f9732189aed33feec7f1927891ac8e8fe1d15df1d5895dcfcc02e0939a0d0b5e", // v1.9.6
  },
  non_tls: {
    amd64: "9db01a8e795ffa77e0220de75c37f3fde83ec8e411e1fad8932977a13d49e8d0", // v0.18.1
    arm64: "82e2311147ea22346d62472c8c897b5fbb9cdbb4d6fe3bcd97298f1637d56935", // v0.18.1
  },
  bravo: {
    amd64: "1ddf2b2846b3c6c4b6b9d3ed5a09bc75f52124aef478c5038e41c70896e2e3d3", // v1.9.6
    arm64: "5f9e057feb82f906ed05d522bc03429b52f60a5b3067157631a1561cd42ad7ad", // v1.9.6
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
