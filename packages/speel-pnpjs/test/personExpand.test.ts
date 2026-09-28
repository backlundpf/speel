// test/personExpand.test.ts
//
// An inline person $expand (`Owner/Title`) answers from the User Information List
// in ITS spelling and projects only Id/Title/EMail/Name; the clause's provider source
// is what tells the provider to translate out and rename back.
import { describe, it, expect } from "vitest";
import {
  personExpandColumn,
  inboundPersonExpand,
} from "../src/principalSources.js";
import { coerceRecord } from "../src/readValues.js";
import { textProperty } from "@speel/core/testing";

describe("inline person $expand", () => {
  it("maps the caller's columns onto what the UIL projects inline, and drops the rest", () => {
    expect(personExpandColumn("Id")).toBe("Id");
    expect(personExpandColumn("ID")).toBe("Id");
    expect(personExpandColumn("Title")).toBe("Title");
    expect(personExpandColumn("LoginName")).toBe("Name");
    expect(personExpandColumn("Email")).toBe("EMail");
    expect(personExpandColumn("PrincipalType")).toBeUndefined();
    expect(personExpandColumn("Description")).toBeUndefined();
  });

  it("renames a sub-record back to model spelling, only the fields asked for", () => {
    const sub = {
      Id: 7,
      Title: "Ada",
      EMail: "ada@x",
      Name: "i:0#.f|m|ada",
      ContentTypeId: "0x010A",
    };
    expect(
      inboundPersonExpand(sub, [
        "ID",
        "Title",
        "LoginName",
        "Email",
        "PrincipalType",
      ]),
    ).toEqual({
      Id: 7,
      Title: "Ada",
      LoginName: "i:0#.f|m|ada",
      Email: "ada@x",
    });
    expect(inboundPersonExpand(sub, ["Title"])).toEqual({
      Id: 7,
      Title: "Ada",
    });
  });

  it("coerceRecord renames a provider-sourced expand's rows (single and {results}) and leaves a list expand alone", () => {
    const clause = {
      navColumn: "Owner",
      selectFields: ["Title", "LoginName", "Email"],
      source: { kind: "provider" as const, key: "principals" },
      properties: [textProperty("Title")],
    };
    const one = coerceRecord(
      { Id: 1, Owner: { Id: 7, Title: "Ada", Name: "n", EMail: "e" } },
      undefined,
      [clause],
    );
    expect(one.Owner).toEqual({
      Id: 7,
      Title: "Ada",
      LoginName: "n",
      Email: "e",
    });
    const many = coerceRecord(
      { Id: 1, Reviewers: { results: [{ Id: 7, Name: "n" }] } },
      undefined,
      [{ ...clause, navColumn: "Reviewers" }],
    );
    expect(many.Reviewers).toEqual([{ Id: 7, LoginName: "n" }]);
    const list = coerceRecord(
      { Id: 1, Program: { Id: 3, Title: "P" } },
      undefined,
      [
        {
          navColumn: "Program",
          selectFields: ["Title"],
          source: { kind: "title" as const, value: "Programs" },
        },
      ],
    );
    expect(list.Program).toEqual({ Id: 3, Title: "P" });
  });
});
