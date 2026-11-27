import { getCacheMode } from "./cache";

describe("getCacheMode", () => {
  const original = process.env.ACTIONS_CACHE_MODE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ACTIONS_CACHE_MODE;
    } else {
      process.env.ACTIONS_CACHE_MODE = original;
    }
  });

  it.each([
    ["none", "none"],
    ["read", "read"],
    [" READ ", "read"],
    ["Write-Only", "write-only"],
    ["", ""],
  ])("normalizes %p to %p", (value: string, expected: string) => {
    process.env.ACTIONS_CACHE_MODE = value;
    expect(getCacheMode()).toBe(expected);
  });

  it("returns an empty string when ACTIONS_CACHE_MODE is unset", () => {
    delete process.env.ACTIONS_CACHE_MODE;
    expect(getCacheMode()).toBe("");
  });
});
