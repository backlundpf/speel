// test/httpError.test.ts
import { describe, it, expect } from "vitest";
import { httpErrorFacts } from "../src/httpError.js";

// PnPjs 4.x HttpRequestError puts the raw response text after "::> " in its message.
const wrapped = (status: number, body: string) => ({
  status,
  message: `Error making HttpClient request in queryable [${status}] Internal Server Error ::> ${body}`,
});

describe("httpErrorFacts", () => {
  it("takes the server's message out of an odata.error body (odata=verbose/minimal)", () => {
    const f = httpErrorFacts(
      wrapped(
        500,
        JSON.stringify({
          "odata.error": {
            code: "-2130245363, Microsoft.SharePoint.SPException",
            message: { lang: "en-US", value: "The folder already exists." },
          },
        }),
      ),
    );
    expect(f).toMatchObject({
      status: 500,
      message: "The folder already exists.",
    });
  });

  it("takes the server's message out of an error body with a message object", () => {
    const f = httpErrorFacts(
      wrapped(
        403,
        JSON.stringify({
          error: {
            code: "-2147024891, System.UnauthorizedAccessException",
            message: { lang: "en-US", value: "Access denied." },
          },
        }),
      ),
    );
    expect(f.message).toBe("Access denied.");
  });

  it("takes the server's message out of an error body with a string message", () => {
    const f = httpErrorFacts(
      wrapped(
        429,
        JSON.stringify({ error: { code: "x", message: "Slow down." } }),
      ),
    );
    expect(f.message).toBe("Slow down.");
  });

  it("keeps the wrapper message when the body is not a recognizable error", () => {
    const e = wrapped(502, "<html>Bad gateway</html>");
    expect(httpErrorFacts(e).message).toBe(e.message);
  });

  it("keeps a plain error's message", () => {
    expect(httpErrorFacts(new Error("network down"))).toEqual({
      message: "network down",
      body: "network down",
    });
  });
});
