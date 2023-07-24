export const cacheKey = "harden-runner-cacheKey";
export const cacheFile = "/home/agent/cache.txt";

export interface ArtifactCacheEntry {
  cacheKey?: string;
  scope?: string;
  creationTime?: string;
  archiveLocation?: string;
}

export enum CompressionMethod {
  Gzip = "gzip",
  // Long range mode was added to zstd in v1.3.2.
  // This enum is for earlier version of zstd that does not have --long support
  ZstdWithoutLong = "zstd-without-long",
  Zstd = "zstd",
}
// Refer: https://github.com/actions/cache/blob/12681847c623a9274356751fdf0a63576ff3f846/src/utils/actionUtils.ts#L53
const RefKey = "GITHUB_REF";
export function isValidEvent(): boolean {
  return RefKey in process.env && Boolean(process.env[RefKey]);
}
