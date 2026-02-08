import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "19c35eee1347077eb71306b122ad4a1cf83f36ef0f69fd91b0c0d79ffd0eabdd", // v1.7.10
    arm64: "f9192788e86b2e44b795f072e8cc03eec9852649609aeedac0761d3b67c991fa",
  },
  non_tls: {
    amd64: "336093af8ebe969567b66fd035af3bd4f7e1c723ce680d6b4b5b2a1f79bc329e", // v0.14.2
  },
  darwin: "eefb162810c378653c16e122e024314a2e47592dc98b295433b26ad1a4f28590", // v0.0.2
  windows: {
    amd64: "9e4fde66331be3261ae6ff954e531e94335b5774ac7e105f0126b391ee1c6d66", // v1.0.0-int
  },
};

// verifyChecksum returns true if checksum is valid
export function verifyChecksum(
  downloadPath: string,
  isTLS: boolean,
  variant: string,
  platform: string
) {
  const fileBuffer: Buffer = fs.readFileSync(downloadPath);
  const checksum: string = crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("hex"); // checksum of downloaded file

  let expectedChecksum: string = "";

  switch (platform) {
    case "linux":
      expectedChecksum = isTLS
        ? CHECKSUMS["tls"][variant]
        : CHECKSUMS["non_tls"][variant];
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
