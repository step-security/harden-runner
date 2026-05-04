import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export const CHECKSUMS = {
  tls: {
    amd64: "190934753f8b8b1c645217d79cf63fd393bd213f14f4ab9cf5f7ccf3fc9d44ee", // v1.8.4
    arm64: "15c6436a12906a4e9c249dc167a36bb584b8886b1597e7baf57ac7bdc7668658",
  },
  non_tls: {
    amd64: "e38de61e1afd98dd339bb9acce4996183875d482be1638fb198ab02b3e25bbef", // v0.16.0
  },
  bravo: {
    amd64: "d1c008979725fed6e003a2ff66461700ebe68a9fb0c36f19e5d20276d1cd3b13", // v1.8.4
    arm64: "e4daa0696b64b4ac8c8e7dad6f6d4621947cddacf70abcbb64f89645457ac391",
  },
  darwin: "fe26a1f6af4afe9f1a854d8633832f5d18ab542827003cae445b3a64021d612c", // v0.0.5
  windows: {
    amd64: "93f1e5d87c6647e6eca7963d5f4b4bd73107029430f8e6945ffece93007a89f5", // v1.0.2
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
