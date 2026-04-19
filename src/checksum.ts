import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

const CHECKSUMS = {
  tls: {
    amd64: "6105000c6c61f4a3ca27ed3a2796baa206bdb1eb83f0463adb0ec7e565af6e1c", // v1.8.1
    arm64: "0992da262be06580335725263ba6ee5c009dfd0448a948b7768ec077fdb9d3d8",
  },
  non_tls: {
    amd64: "4aaaeebbe10e619d8ce13e8cc4a1acbafc8f891e8cdd319984480b9ec08407b8", // v0.15.0
  },
  bravo: {
    amd64: "2eeaa1b3cfb05adea0a4e2a36e342ccaf95b41aeb82a6a6e217d2971c15f5553", // v1.8.1
    arm64: "8d7035ffbda165ad86de8bd00bf861c038e4a9e6d501adadc53a265945882533",
  },
  darwin: "fe26a1f6af4afe9f1a854d8633832f5d18ab542827003cae445b3a64021d612c", // v0.0.5
  windows: {
    amd64: "e98f8b9cf9ecf6566f1e16a470fbe4aef01610a644fd8203a1bab3ff142186c8", // v1.0.0
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
