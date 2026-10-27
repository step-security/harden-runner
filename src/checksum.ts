import * as core from "@actions/core";
import * as crypto from "crypto";
import * as fs from "fs";

export const CHECKSUMS = {
  tls: {
    amd64: "811c33347d8152cf12cbcc665f571293e6af47ecf151134da9fb5195909b8a56", // v1.9.5
    arm64: "6738ceea3aa817670aac8085b6e82095b37d81ce76e4cc5b0ac73bae4abea2ff", // v1.9.5
  },
  non_tls: {
    amd64: "baec749d7477e37c4410bbe1c5a1669ba72de18a49d3d013e817a9ae95d122e5", // v0.18.0
    arm64: "ec783c4c6a04e7d60788596c71aa9f8fd19fef20985dc2bd72ce2aa7e513649f", // v0.18.0
  },
  bravo: {
    amd64: "8fcae88b4f127371f943a44e020ca69c00a60db3fc92a582e9890ceb533f25a9", // v1.9.5
    arm64: "8af18952c1cc7f9a18c4f337df2c3fd542c5180e94abaa666ee74c8c4956597c", // v1.9.5
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
