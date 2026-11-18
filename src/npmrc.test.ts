import {
  describeRegistry,
  findEnv,
  isDefaultRegistry,
  mergeNpmrc,
  unscopedRegistry,
} from "./npmrc";

const REGISTRY = "https://community.registry.stepsecurity.io/javascript/";
const TOKEN = "step_sr_token";
const OURS = [
  `registry=${REGISTRY}`,
  `//community.registry.stepsecurity.io/javascript/:_authToken=${TOKEN}`,
  "//community.registry.stepsecurity.io/javascript/:always-auth=true",
];

function merge(source: string, omitLockfileResolved = false) {
  return mergeNpmrc(source, { registryUrl: REGISTRY, token: TOKEN, omitLockfileResolved });
}

describe("findEnv", () => {
  test("matches npm config variables case-insensitively", () => {
    expect(findEnv({ NPM_CONFIG_REGISTRY: "https://a/" }, "npm_config_registry")).toEqual({
      key: "NPM_CONFIG_REGISTRY",
      value: "https://a/",
    });
    expect(findEnv({ npm_config_registry: "https://b/" }, "npm_config_registry")).toEqual({
      key: "npm_config_registry",
      value: "https://b/",
    });
  });

  test("treats empty values as unset", () => {
    expect(findEnv({ NPM_CONFIG_REGISTRY: "" }, "npm_config_registry")).toBeUndefined();
    expect(findEnv({}, "npm_config_registry")).toBeUndefined();
  });
});

describe("unscopedRegistry", () => {
  test.each([
    ["no registry line", "save-exact=true\n", undefined],
    ["single line", "registry=https://registry.npmjs.org/\n", "https://registry.npmjs.org/"],
    ["last one wins", "registry=https://a.example/\nregistry=https://b.example/\n", "https://b.example/"],
    ["spaces around =", "registry = https://a.example/\n", "https://a.example/"],
    ["quoted value", 'registry="https://a.example/"\n', "https://a.example/"],
    ["scoped registry ignored", "@example-org:registry=https://npm.pkg.github.com\n", undefined],
    ["comments ignored", "; registry=https://a.example/\n# registry=https://b.example/\n", undefined],
    ["CRLF", "save-exact=true\r\nregistry=https://a.example/\r\n", "https://a.example/"],
  ])("%s", (_name, content, expected) => {
    expect(unscopedRegistry(content)).toBe(expected);
  });
});

describe("isDefaultRegistry", () => {
  test.each([
    ["https://registry.npmjs.org/", true],
    ["https://registry.npmjs.org", true],
    ["http://registry.npmjs.org/", true],
    ["https://registry.yarnpkg.com", true],
    ["https://artifactory.example.com/api/npm/npm/", false],
    ["${NPM_MIRROR}", false],
    ["not a url", false],
  ])("%s -> %s", (value, expected) => {
    expect(isDefaultRegistry(value)).toBe(expected);
  });
});

describe("describeRegistry", () => {
  test("shows only the host so URL credentials are not logged", () => {
    expect(describeRegistry("https://user:secret@mirror.example.com/npm/")).toBe("mirror.example.com");
  });

  test("shows variable references as written", () => {
    expect(describeRegistry("${NPM_MIRROR}")).toBe("${NPM_MIRROR}");
  });

  test("does not echo values that are not URLs", () => {
    expect(describeRegistry("garbage")).toBe("a value that is not a URL");
  });
});

describe("mergeNpmrc", () => {
  test("writes only our lines when there is no existing config", () => {
    expect(merge("")).toBe(OURS.join("\n") + "\n");
  });

  test("keeps scoped registries and their auth verbatim, without expanding variables", () => {
    const source = [
      "@example-org:registry=https://npm.pkg.github.com/",
      "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}",
      "save-exact=true",
    ].join("\n");
    expect(merge(source)).toBe([...source.split("\n"), ...OURS].join("\n") + "\n");
  });

  test("replaces an unscoped registry line, as written by setup-node", () => {
    const source = [
      "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}",
      "registry=https://registry.npmjs.org/",
      "always-auth=false",
    ].join("\n");
    expect(merge(source)).toBe(
      [
        "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}",
        "always-auth=false",
        ...OURS,
      ].join("\n") + "\n"
    );
  });

  test("drops existing settings for our host, keeps other hosts", () => {
    const source = [
      "//community.registry.stepsecurity.io/javascript/:_authToken=step_sr_old",
      "//community.registry.stepsecurity.io/other/:_authToken=step_sr_older",
      "//registry.example.com/:_authToken=keep-me",
    ].join("\n");
    expect(merge(source)).toBe(["//registry.example.com/:_authToken=keep-me", ...OURS].join("\n") + "\n");
  });

  test("keeps a global always-auth=false next to our host-scoped always-auth", () => {
    // setup-node writes always-auth=false; yarn 1 reads the host-scoped key first.
    expect(merge("always-auth=false\n")).toBe(["always-auth=false", ...OURS].join("\n") + "\n");
  });

  test("keeps comments and blank lines in the middle", () => {
    const source = "; managed by ops\n\nsave-exact=true\n\n\n";
    expect(merge(source)).toBe(["; managed by ops", "", "save-exact=true", ...OURS].join("\n") + "\n");
  });

  test("keeps CRLF line endings", () => {
    expect(merge("save-exact=true\r\n")).toBe(["save-exact=true", ...OURS].join("\r\n") + "\r\n");
  });

  test("adds omit-lockfile-registry-resolved when lockfile_resolved is omit", () => {
    expect(merge("", true)).toBe([...OURS, "omit-lockfile-registry-resolved=true"].join("\n") + "\n");
  });

  test("adds the trailing slash npm needs to match the token to the registry", () => {
    const merged = mergeNpmrc("", {
      registryUrl: "https://community.registry.stepsecurity.io/javascript",
      token: TOKEN,
      omitLockfileResolved: false,
    });
    expect(merged).toBe(OURS.join("\n") + "\n");
  });
});
