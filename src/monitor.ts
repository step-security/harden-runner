import { STATUS_HARDEN_RUNNER_UNAVAILABLE } from "./common";

// Posts to the /monitor endpoint, making up to 3 attempts with a 3s timeout each.
// A timeout, a network error, or a status other than 200/409 is retried. 200 and
// 409 (Harden Runner unavailable) are final. Returns the last response received,
// or undefined if no attempt got a response.
export async function postMonitor(
  url: string,
  body: unknown,
  apiUrl: string
): Promise<Response | undefined> {
  let resp: Response | undefined;
  for (let retry = 0; retry < 3; retry++) {
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });
      if (resp.status === 200 || String(resp.status) === STATUS_HARDEN_RUNNER_UNAVAILABLE) break;
      console.log(`monitor call returned ${resp.status} (attempt ${retry + 1}/3)`);
    } catch (e) {
      console.log(`error in connecting to ${apiUrl} (attempt ${retry + 1}/3): ${e}`);
    }
  }
  return resp;
}
