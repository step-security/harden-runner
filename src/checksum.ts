import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export const CHECKSUMS = {
  tls: {
    amd64: "07703be7dedacfa234e7962289e952d3731d9c5677054ce4f6e4c9dbf79b77ed", // v1.9.0
    arm64: "6b3c8927928ccc0a9df3097eabd95ec3c00f98b3b25bb6eb6b5e99020584a53c", // v1.9.0
  },
  non_tls: {
    amd64: "4b14d8a3a5fbcef95af55e0c54d3bee6f44da802878c10289a4ca0b79b6d0237", // v0.16.2
  },
  bravo: {
    amd64: "3733cdd704e8f6455f036ff3534d53f965a0e6028a39c654ae4f1679e6b4c45b", // v1.9.0
    arm64: "ecf8a50679cac9402795f7434f2edb470bd83fe47512bbc3f52bf9b956c1b62c", // v1.9.0
  },
  darwin: "2990f0390d2760fa6262a3830060b6db1233f16a1410ffe1ed2bf13dfda80c38", // v0.0.6
  windows: {
    amd64: "5e3604d08aba65d7bdd1d0684826d5894ffb0c6f56b914c6ecb35c3271e04483", // v1.0.7
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
