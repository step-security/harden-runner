import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export const CHECKSUMS = {
  tls: {
    amd64: "47c42675bce38c6ab7c4dcba90f009c8567f491bc71ecf492f4ef1876c300700", // v1.8.14
    arm64: "9aed5e0a4a97ad019f943087dee6b7bd6ace340b06c6faba5615927b9a50a7d4", // v1.8.14
  },
  non_tls: {
    amd64: "4b14d8a3a5fbcef95af55e0c54d3bee6f44da802878c10289a4ca0b79b6d0237", // v0.16.2
  },
  bravo: {
    amd64: "83d8189320edc26085e3fefc3682db231e778b563d2f22bc7bf7c339a9562aab", // v1.8.14
    arm64: "1d9813cdf3684339c542f9342805a173c457af1860b98da66b7672918e121434", // v1.8.14
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
