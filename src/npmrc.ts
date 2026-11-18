// npm user config rules for secure-registry, as plain string functions with
// no I/O.

const DEFAULT_REGISTRY_HOSTS = ["registry.npmjs.org", "registry.yarnpkg.com"];

// Looks up an npm config environment variable case-insensitively, the way npm
// reads npm_config_* variables. Empty values are treated as unset.
export function findEnv(
  env: NodeJS.ProcessEnv,
  name: string
): { key: string; value: string } | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(env)) {
    if (key.toLowerCase() === wanted && value) {
      return { key, value };
    }
  }
  return undefined;
}

function parseLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();
  if (trimmed === "" || trimmed.startsWith(";") || trimmed.startsWith("#")) {
    return undefined;
  }
  const eq = trimmed.indexOf("=");
  if (eq === -1) {
    return undefined;
  }
  let value = trimmed.slice(eq + 1).trim();
  if (
    value.length >= 2 &&
    (value[0] === '"' || value[0] === "'") &&
    value[value.length - 1] === value[0]
  ) {
    value = value.slice(1, -1);
  }
  return { key: trimmed.slice(0, eq).trim(), value };
}

// Returns the unscoped registry= value npm would use from this file (the last
// one wins), or undefined when the file does not set one.
export function unscopedRegistry(content: string): string | undefined {
  let registry: string | undefined;
  for (const line of content.split(/\r?\n/)) {
    const entry = parseLine(line);
    if (entry?.key === "registry") {
      registry = entry.value;
    }
  }
  return registry;
}

// True only for the public npm registry and its yarn alias. Anything else,
// including a ${VAR} reference we cannot resolve, is a registry the user
// chose on purpose.
export function isDefaultRegistry(value: string): boolean {
  if (value.includes("${")) {
    return false;
  }
  try {
    return DEFAULT_REGISTRY_HOSTS.includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

// Describes a registry value for a log line without echoing credentials that
// may be embedded in the URL.
export function describeRegistry(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value.includes("${") ? value : "a value that is not a URL";
  }
}

export interface MergeOptions {
  registryUrl: string;
  token: string;
  omitLockfileResolved: boolean;
}

// Builds the job's npm user config: the source lines verbatim (${VAR}
// references are left for npm to expand), minus unscoped registry= lines and
// any existing settings for the secure-registry host, followed by our
// registry, its host-scoped token and a host-scoped always-auth.
export function mergeNpmrc(source: string, opts: MergeOptions): string {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";

  const registry = new URL(opts.registryUrl);
  if (!registry.pathname.endsWith("/")) {
    registry.pathname += "/";
  }
  const hostPrefix = `//${registry.host}/`;

  const kept = source.split(/\r?\n/).filter((line) => {
    const entry = parseLine(line);
    return (
      entry === undefined ||
      (entry.key !== "registry" && !entry.key.startsWith(hostPrefix))
    );
  });
  while (kept.length > 0 && kept[kept.length - 1].trim() === "") {
    kept.pop();
  }

  kept.push(`registry=${registry.href}`);
  kept.push(`//${registry.host}${registry.pathname}:_authToken=${opts.token}`);
  // yarn 1 sends the token for unscoped packages only when always-auth is
  // set, and gets 401 without it. npm and pnpm ignore the key (npm 11 prints
  // an "Unknown user config" warning). Scoped to our host, so it beats a
  // global always-auth=false (setup-node writes one) and no other registry
  // gets credentials.
  kept.push(`//${registry.host}${registry.pathname}:always-auth=true`);
  if (opts.omitLockfileResolved) {
    kept.push("omit-lockfile-registry-resolved=true");
  }
  return kept.join(eol) + eol;
}
