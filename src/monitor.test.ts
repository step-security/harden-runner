import { postMonitor } from "./monitor";

const ORIGINAL_FETCH = globalThis.fetch;
const URL = "https://api.example.com/v1/github/o/r/actions/runs/1/monitor";
const API_URL = "https://api.example.com/v1";
const BODY = { correlation_id: "cid", job: "build" };

// Each entry is one attempt: an HTTP status to respond with, or an Error to throw
// (a network error or timeout).
function mockFetchSequence(...attempts: Array<number | Error>) {
  const fetchMock = jest.fn(async () => {
    const next = attempts[Math.min(fetchMock.mock.calls.length - 1, attempts.length - 1)];
    if (next instanceof Error) throw next;
    return new Response("{}", { status: next });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const networkError = () => new TypeError("fetch failed");
const timeoutError = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe("postMonitor", () => {
  test("returns the first 200 without retrying", async () => {
    const fetchMock = mockFetchSequence(200);

    const resp = await postMonitor(URL, BODY, API_URL);

    expect(resp?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("sends a POST with the JSON body and a timeout signal", async () => {
    const fetchMock = mockFetchSequence(200);

    await postMonitor(URL, BODY, API_URL);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify(BODY));
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  // Regression: a 409 followed by network errors used to be retried and lost, so the
  // unavailable check was skipped and the agent was installed.
  test("treats 409 as final: 409 then network errors keeps the 409 after one call", async () => {
    const fetchMock = mockFetchSequence(409, networkError(), networkError());

    const resp = await postMonitor(URL, BODY, API_URL);

    expect(resp?.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("returns a 409 received after a retryable error", async () => {
    const fetchMock = mockFetchSequence(500, 409);

    const resp = await postMonitor(URL, BODY, API_URL);

    expect(resp?.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("retries server errors and returns the 200 that follows", async () => {
    const fetchMock = mockFetchSequence(503, 503, 200);

    const resp = await postMonitor(URL, BODY, API_URL);

    expect(resp?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("retries a timeout and returns the 200 that follows", async () => {
    const fetchMock = mockFetchSequence(timeoutError(), 200);

    const resp = await postMonitor(URL, BODY, API_URL);

    expect(resp?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("returns the last status when every attempt gets an error response", async () => {
    const fetchMock = mockFetchSequence(503, 502, 500);

    const resp = await postMonitor(URL, BODY, API_URL);

    expect(resp?.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("keeps an earlier error status when the remaining attempts get no response", async () => {
    const fetchMock = mockFetchSequence(503, networkError(), networkError());

    const resp = await postMonitor(URL, BODY, API_URL);

    expect(resp?.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("returns undefined after three attempts with no response", async () => {
    const fetchMock = mockFetchSequence(timeoutError(), networkError(), timeoutError());

    const resp = await postMonitor(URL, BODY, API_URL);

    expect(resp).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("logs each failed attempt with its attempt number", async () => {
    mockFetchSequence(503, networkError(), 200);

    await postMonitor(URL, BODY, API_URL);

    const logs = (console.log as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(logs).toEqual([
      "monitor call returned 503 (attempt 1/3)",
      `error in connecting to ${API_URL} (attempt 2/3): TypeError: fetch failed`,
    ]);
  });
});
