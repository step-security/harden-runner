import { redactSignedUrls } from "./redact";

const SIGNED =
  "https://bucket.s3.us-west-2.amazonaws.com/runs/o/r/raw_events/1/process_events.json" +
  "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIAEXAMPLE%2F20260101%2Fus-west-2%2Fs3%2Faws4_request" +
  "&X-Amz-Date=20260101T000000Z&X-Amz-Expires=300&X-Amz-Security-Token=tokenvalue" +
  "&X-Amz-SignedHeaders=content-type%3Bhost&X-Amz-Signature=abc123";
const BASE = SIGNED.split("?")[0];

describe("redactSignedUrls", () => {
  test("an upload error quoting a signed URL", () => {
    const line = `[uploadEvents] unable to upload events: Put "${SIGNED}": context deadline exceeded`;
    expect(redactSignedUrls(line)).toBe(
      `[uploadEvents] unable to upload events: Put "${BASE}?REDACTED": context deadline exceeded`
    );
  });

  test("a signed URL in JSON-escaped output", () => {
    const escaped = SIGNED.replace(/&/g, "\\u0026");
    const out = redactSignedUrls(`{"msg":"Put \\"${escaped}\\": EOF"}`);
    expect(out).toBe(`{"msg":"Put \\"${BASE}?REDACTED\\": EOF"}`);
  });

  test("every signed URL on a line, whatever the parameter case", () => {
    const lower = SIGNED.replace("X-Amz-Signature", "x-amz-signature").replace(/X-Amz-(Credential|Security-Token)=[^&]*&?/g, "");
    const out = redactSignedUrls(`${SIGNED} ${lower}`);
    expect(out).toBe(`${BASE}?REDACTED ${BASE}?REDACTED`);
    for (const secret of ["ASIAEXAMPLE", "tokenvalue", "abc123"]) expect(out).not.toContain(secret);
  });

  test("other URLs and text are unchanged", () => {
    const text =
      "GET https://api.stepsecurity.io/v1/x?repo=o/r&run=1 ok\n" +
      "https://bucket.s3.amazonaws.com/file.json\nno URL here, X-Amz-Signature=abc\n";
    expect(redactSignedUrls(text)).toBe(text);
  });
});
