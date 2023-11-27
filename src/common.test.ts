import { processLogLine } from "./common"; // import the function

describe("processLogLine function", () => {
  it("correctly processes the log line and adds an entry to the array", () => {
    const tableEntries: {
      pid: string;
      process: string;
      domain: string;
      ipAddress: string;
      status: string;
    }[] = [];
    const logLine =
      "Thu, 15 Jun 2023 05:35:29 GMT:endpoint called ip address:port 104.16.24.35:443, domain: registry.npmjs.org., pid: 2135, process: node.";

    processLogLine(logLine, tableEntries);

    // Check if a single entry is added to the array
    expect(tableEntries.length).toBe(1);

    // Check if the entry's properties are set correctly
    const entry = tableEntries[0];
    expect(entry.pid).toBe("2135");
    expect(entry.process).toBe("node");
    expect(entry.domain).toBe("registry.npmjs.org.");
    expect(entry.ipAddress).toBe("104.16.24.35:443");
    expect(entry.status).toBe("✅ Allowed"); // Since the IP address is not '54.185.253.63', status should be '✔️ Allowed'
  });
});
