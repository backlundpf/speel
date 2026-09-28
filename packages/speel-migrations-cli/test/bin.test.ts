import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/bin.js";

describe("parseArgs", () => {
  it("parses add with a name and optional --config", () => {
    expect(parseArgs(["add", "AddProjects"])).toEqual({
      command: "add",
      name: "AddProjects",
      config: "speel.migrations.config.ts",
    });
    expect(parseArgs(["add", "X", "--config", "cfg.ts"])).toEqual({
      command: "add",
      name: "X",
      config: "cfg.ts",
    });
  });
  it("parses list and remove", () => {
    expect(parseArgs(["list"])).toMatchObject({ command: "list" });
    expect(parseArgs(["remove"])).toMatchObject({ command: "remove" });
  });
  it("throws on add without a name", () => {
    expect(() => parseArgs(["add"])).toThrow(/name/i);
  });
  it("throws on an unknown command", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow(/unknown command/i);
  });
});
