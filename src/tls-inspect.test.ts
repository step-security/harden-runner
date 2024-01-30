import nock from "nock";
import { STEPSECURITY_API_URL } from "./configs";
import { isTLSEnabled } from "./tls-inspect";

test("tls-inspect enabled", async () => {
  let owner = "h0x0er";
  let expected = true;

  const resp = nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/actions/tls-inspection-status`)
    .reply(200, "");

  let got = await isTLSEnabled(owner);

  expect(got).toEqual(expected);
});

test("tls-inspect not enabled", async () => {
  let owner = "step-security";
  let expected = false;

  const resp = nock(`${STEPSECURITY_API_URL}`)
    .get(`/github/${owner}/actions/tls-inspection-status`)
    .reply(401, "");

  let got = await isTLSEnabled(owner);

  expect(got).toEqual(expected);
});
