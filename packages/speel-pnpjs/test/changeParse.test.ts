import { describe, it, expect } from "vitest";
import { parseDeletedIds, parseLastChangeToken } from "../src/changeParse.js";

const XML = `<?xml version="1.0" encoding="utf-8"?>
<listitems xmlns:rs="urn:schemas-microsoft-com:rowset">
  <Changes LastChangeToken="1;3;abc;638400000000000000;777">
    <Id ChangeType="Delete">42</Id>
    <Id ChangeType="Delete">43</Id>
  </Changes>
  <rs:data ItemCount="1"></rs:data>
</listitems>`;

describe("changeParse", () => {
  it('parseDeletedIds extracts ChangeType="Delete" ids', () => {
    expect(parseDeletedIds(XML)).toEqual([42, 43]);
  });

  it("parseDeletedIds returns [] when there are no deletes", () => {
    expect(
      parseDeletedIds('<listitems><Changes LastChangeToken="x"/></listitems>'),
    ).toEqual([]);
  });

  it("parseLastChangeToken reads the Changes LastChangeToken attribute", () => {
    expect(parseLastChangeToken(XML)).toBe("1;3;abc;638400000000000000;777");
  });

  it("parseLastChangeToken returns undefined when absent", () => {
    expect(parseLastChangeToken("<listitems></listitems>")).toBeUndefined();
  });
});
