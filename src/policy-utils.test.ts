import nock from "nock";
import { apiEndpoint, fetchPolicy } from "./policy-utils";

test("success: fetching policy", async () => {
  let owner = "h0x0er";
  let policyName = "policy1";
  let response = {"owner":"h0x0er","policyName":"policy1","allowed_endpoints":["github.com:443"],"egress_policy":"audit","disable_telemetry":false,"disable_sudo":false,"disable_file_monitoring":false};
  const policyScope = nock(`${apiEndpoint}`)
    .get(`/github/${owner}/actions/policies/${policyName}`)
    .reply(200, response);

  let policy = await fetchPolicy(owner, policyName);
  console.log(policy);
  expect(policy).toStrictEqual(response);
});