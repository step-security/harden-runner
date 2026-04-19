import * as fs from "fs";
import * as crypto from "crypto";
import * as core from "@actions/core";
import { verifyChecksum, CHECKSUMS } from "./checksum";

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  readFileSync: jest.fn(),
}));
jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  createHash: jest.fn(),
}));
jest.mock("@actions/core");

const mockReadFile = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;
const mockSetFailed = core.setFailed as jest.MockedFunction<typeof core.setFailed>;
const mockCreateHash = crypto.createHash as jest.MockedFunction<typeof crypto.createHash>;

function stubHash(hash: string) {
  mockCreateHash.mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue(hash),
  } as unknown as crypto.Hash);
}

const WRONG_HASH = "0".repeat(64);

describe("verifyChecksum", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockReturnValue(Buffer.from("test-payload"));
  });

  describe("agentType=bravo", () => {
    test("passes with matching bravo amd64 checksum", () => {
      stubHash(CHECKSUMS.bravo.amd64);
      expect(verifyChecksum("/tmp/f", true, "amd64", "linux", "bravo")).toBe(true);
      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    test("passes with matching bravo arm64 checksum", () => {
      stubHash(CHECKSUMS.bravo.arm64);
      expect(verifyChecksum("/tmp/f", true, "arm64", "linux", "bravo")).toBe(true);
    });

    test("uses bravo checksum even when isTLS=false", () => {
      stubHash(CHECKSUMS.bravo.amd64);
      expect(verifyChecksum("/tmp/f", false, "amd64", "linux", "bravo")).toBe(true);
    });

    test("fails on mismatched bravo checksum", () => {
      stubHash(WRONG_HASH);
      expect(verifyChecksum("/tmp/f", true, "amd64", "linux", "bravo")).toBe(false);
      expect(mockSetFailed).toHaveBeenCalled();
    });
  });

  describe("agentType default (omitted)", () => {
    test("uses TLS checksum when isTLS=true", () => {
      stubHash(CHECKSUMS.tls.amd64);
      expect(verifyChecksum("/tmp/f", true, "amd64", "linux")).toBe(true);
    });

    test("uses non_tls checksum when isTLS=false", () => {
      stubHash(CHECKSUMS.non_tls.amd64);
      expect(verifyChecksum("/tmp/f", false, "amd64", "linux")).toBe(true);
    });

    test("TLS mismatch fails", () => {
      stubHash(CHECKSUMS.bravo.amd64);
      expect(verifyChecksum("/tmp/f", true, "amd64", "linux")).toBe(false);
      expect(mockSetFailed).toHaveBeenCalled();
    });
  });

  describe("darwin", () => {
    test("passes with matching darwin checksum", () => {
      stubHash(CHECKSUMS.darwin);
      expect(verifyChecksum("/tmp/f", false, "", "darwin")).toBe(true);
    });
  });

  describe("win32", () => {
    test("passes with matching windows amd64 checksum", () => {
      stubHash(CHECKSUMS.windows.amd64);
      expect(verifyChecksum("/tmp/f", false, "amd64", "win32")).toBe(true);
    });
  });

  describe("unsupported platform", () => {
    test("returns false without calling setFailed", () => {
      stubHash(CHECKSUMS.bravo.amd64);
      expect(verifyChecksum("/tmp/f", true, "amd64", "freebsd")).toBe(false);
      expect(mockSetFailed).not.toHaveBeenCalled();
    });
  });
});
