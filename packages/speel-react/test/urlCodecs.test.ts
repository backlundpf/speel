import { describe, it, expect } from "vitest";
import { urlString, urlBoolean, urlNumber } from "../src/url/codecs.js";

describe("urlString", () => {
  it("decodes an absent or empty key to its default", () => {
    expect(urlString().decode(null)).toBeNull();
    expect(urlString().decode("")).toBeNull();
    expect(urlString({ default: "all" }).decode(null)).toBe("all");
  });

  it("round-trips a value", () => {
    const c = urlString();
    expect(c.decode(c.encode("REQ-1-AO-1"))).toBe("REQ-1-AO-1");
  });

  it("encodes null and empty to null so the key is removed", () => {
    expect(urlString().encode(null)).toBeNull();
    expect(urlString().encode("")).toBeNull();
  });

  it("defaults to replace and honours an explicit push", () => {
    expect(urlString().history).toBe("replace");
    expect(urlString({ history: "push" }).history).toBe("push");
  });
});

describe("urlBoolean", () => {
  it("decodes an absent key to its default", () => {
    expect(urlBoolean().decode(null)).toBe(false);
    expect(urlBoolean({ default: true }).decode(null)).toBe(true);
  });

  it('decodes only the literal "true" as true', () => {
    expect(urlBoolean().decode("true")).toBe(true);
    expect(urlBoolean().decode("false")).toBe(false);
    // Unparseable input decodes to false, never throws.
    expect(urlBoolean().decode("yes")).toBe(false);
  });

  it("round-trips both values", () => {
    const c = urlBoolean({ default: true });
    expect(c.decode(c.encode(false))).toBe(false);
    expect(c.decode(c.encode(true))).toBe(true);
  });
});

describe("urlNumber", () => {
  it("decodes an absent key to its default", () => {
    expect(urlNumber().decode(null)).toBeNull();
    expect(urlNumber({ default: 10 }).decode(null)).toBe(10);
  });

  it("decodes unparseable input to the default rather than NaN", () => {
    expect(urlNumber({ default: 10 }).decode("abc")).toBe(10);
    expect(urlNumber({ default: 10 }).decode("")).toBe(10);
    expect(urlNumber({ default: 10 }).decode("Infinity")).toBe(10);
  });

  it("round-trips a value", () => {
    const c = urlNumber();
    expect(c.decode(c.encode(42))).toBe(42);
  });
});
