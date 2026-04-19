import * as fs from "fs";
import * as crypto from "crypto";
import * as core from "@actions/core";
import { verifyChecksum } from "./checksum";

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

const BRAVO_AMD64 = "2eeaa1b3cfb05adea0a4e2a36e342ccaf95b41aeb82a6a6e217d2971c15f5553";
const BRAVO_ARM64 = "8d7035ffbda165ad86de8bd00bf861c038e4a9e6d501adadc53a265945882533";
const TLS_AMD64 = "6105000c6c61f4a3ca27ed3a2796baa206bdb1eb83f0463adb0ec7e565af6e1c";
const NON_TLS_AMD64 = "4aaaeebbe10e619d8ce13e8cc4a1acbafc8f891e8cdd319984480b9ec08407b8";

describe("verifyChecksum", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockReturnValue(Buffer.from("test-payload"));
  });

  describe("agentType=bravo", () => {
    test("passes with matching bravo amd64 checksum", () => {
      stubHash(BRAVO_AMD64);
      expect(verifyChecksum("/tmp/f", true, "amd64", "linux", "bravo")).toBe(true);
      expect(mockSetFailed).not.toHaveBeenCalled();
    });

    test("passes with matching bravo arm64 checksum", () => {
      stubHash(BRAVO_ARM64);
      expect(verifyChecksum("/tmp/f", true, "arm64", "linux", "bravo")).toBe(true);
    });

    test("uses bravo checksum even when isTLS=false", () => {
      stubHash(BRAVO_AMD64);
      expect(verifyChecksum("/tmp/f", false, "amd64", "linux", "bravo")).toBe(true);
    });

    test("fails on mismatched bravo checksum", () => {
      stubHash("0".repeat(64));
      expect(verifyChecksum("/tmp/f", true, "amd64", "linux", "bravo")).toBe(false);
      expect(mockSetFailed).toHaveBeenCalled();
    });
  });

  describe("agentType default (omitted)", () => {
    test("uses TLS checksum when isTLS=true", () => {
      stubHash(TLS_AMD64);
      expect(verifyChecksum("/tmp/f", true, "amd64", "linux")).toBe(true);
    });

    test("uses non_tls checksum when isTLS=false", () => {
      stubHash(NON_TLS_AMD64);
      expect(verifyChecksum("/tmp/f", false, "amd64", "linux")).toBe(true);
    });

    test("TLS mismatch fails", () => {
      stubHash(BRAVO_AMD64);
      expect(verifyChecksum("/tmp/f", true, "amd64", "linux")).toBe(false);
      expect(mockSetFailed).toHaveBeenCalled();
    });
  });

  describe("unsupported platform", () => {
    test("returns false without calling setFailed", () => {
      stubHash(BRAVO_AMD64);
      expect(verifyChecksum("/tmp/f", true, "amd64", "freebsd")).toBe(false);
      expect(mockSetFailed).not.toHaveBeenCalled();
    });
  });
});
