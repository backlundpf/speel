import { describe, it, expect, beforeEach } from "vitest";
import { FakeStorageProvider } from "./FakeStorageProvider.js";
import type { IWriteField } from "../../../src/providers/ISharePointProvider.js";
import type { EntitySource } from "../../../src/Metadata/EntityType.js";
import {
  textProperty,
  booleanProperty,
  dateTimeProperty,
  choiceProperty,
  lookupProperty,
  stubEntityType,
} from "../../../src/testing/properties.js";

const list = { kind: "title" as const, value: "Projects" };
const tags = { kind: "title" as const, value: "Tags" };
const principals = { kind: "provider" as const, key: "principals" };
const PRINCIPAL = stubEntityType("Principal", {
  kind: "provider",
  key: "principals",
});
const TAGS = stubEntityType("Tags", { kind: "list", list: tags });
const PROGRAMS = stubEntityType("Programs", {
  kind: "list",
  list: { kind: "title", value: "Programs" },
});
const OWNER = lookupProperty("Owner", PRINCIPAL);
const REVIEWERS = lookupProperty("Reviewers", PRINCIPAL, { multi: true });
const TITLE = textProperty("Title");
const person = (value: unknown, multi = false): IWriteField => ({
  property: multi ? REVIEWERS : OWNER,
  value,
});

let p: FakeStorageProvider;
beforeEach(() => {
  p = new FakeStorageProvider();
  p.seedPrincipal({
    Id: 6,
    Title: "Ada",
    LoginName: "i:0#.f|membership|ada@x",
    PrincipalType: 1,
  });
  p.seedPrincipal({
    Id: 12,
    Title: "Audit Members",
    LoginName: "Audit Members",
    PrincipalType: 8,
  });
});

async function insert(fields: IWriteField[], folder: string | null = null) {
  const [res] = await p.executeBatchAsync([
    {
      kind: "insert",
      list,
      fields,
      folderServerRelativeUrl: folder,
      clientToken: "i",
    },
  ]);
  return res!;
}

describe("FakeStorageProvider insert", () => {
  it("stores every field kind TYPED, under the property's column, exactly as given", async () => {
    const when = new Date(Date.UTC(2027, 2, 15, 12));
    const res = await insert([
      { property: TITLE, value: "t" },
      { property: booleanProperty("IsPublic"), value: true },
      { property: dateTimeProperty("StartDate"), value: when },
      {
        property: choiceProperty("Labels", { multi: true }),
        value: ["A", "B"],
      },
      { property: choiceProperty("Status"), value: "Planning" },
      {
        property: lookupProperty("Tags", TAGS, { multi: true }),
        value: [3, 7],
      },
      { property: lookupProperty("Program", PROGRAMS), value: 2 },
      person(6),
      person([6, 12], true),
    ]);
    expect(res.kind).toBe("success");
    const id = (res as { serverData: { id: number } }).serverData.id;
    const row = await p.getItemByIdAsync(list, id, [
      "Title",
      "IsPublic",
      "StartDate",
      "Labels",
      "Status",
      "TagsId",
      "ProgramId",
      "OwnerId",
      "ReviewersId",
      "FileDirRef",
    ]);
    expect(row).toMatchObject({
      Title: "t",
      IsPublic: true,
      StartDate: when,
      Labels: ["A", "B"],
      Status: "Planning",
      TagsId: [3, 7],
      ProgramId: 2,
      OwnerId: 6,
      ReviewersId: [6, 12],
      FileDirRef: "/sites/dev/Projects",
    });
  });

  it("places a folder insert and reports the folder as FileDirRef", async () => {
    const urls = await p.ensureFoldersAsync(list, ["SpeelE2E/X"]);
    const folder = urls.get("SpeelE2E/X")!;
    const res = await insert([{ property: TITLE, value: "t" }], folder);
    const id = (res as { serverData: { id: number } }).serverData.id;
    const row = await p.getItemByIdAsync(list, id, ["FileDirRef"]);
    expect(row?.FileDirRef).toBe(folder);
  });

  it("a folder insert resolves a principal it has never returned exactly once, and never again", async () => {
    await insert([person(6)], "/sites/dev/Projects/F");
    expect(p.principalResolves()).toEqual([6]);
    await insert([person(6)], "/sites/dev/Projects/F");
    expect(p.principalResolves()).toEqual([6]);
  });

  it("a folder insert resolves nothing for a principal a provider-source read returned", async () => {
    await p.getItemsByIdsAsync(
      { kind: "provider", key: "siteGroups" },
      [12],
      ["Id", "LoginName"],
    );
    await insert([person(12)], "/sites/dev/Projects/F");
    expect(p.principalResolves()).toEqual([]);
  });

  it("a read that did not select LoginName warms nothing: the folder insert still resolves", async () => {
    // What a later claims write needs is the login, and a read that never asked
    // for it holds nothing a write can use — so it must not count as "returned".
    await p.getItemsByIdsAsync(principals, [6], ["Id", "Title"]);
    await insert([person(6)], "/sites/dev/Projects/F");
    expect(p.principalResolves()).toEqual([6]);
  });

  it("a root insert resolves like a folder insert: items.add does not check the id, so the provider must", async () => {
    // Live, items.add answers 201 to a person id the site never issued and stores
    // it dangling; the real provider therefore resolves on both paths and warms its
    // cache from either. The fake models that, so countPrincipalResolves agrees.
    await insert([person(6)]);
    expect(p.principalResolves()).toEqual([6]);
    await insert([person(6)], "/sites/dev/Projects/F");
    expect(p.principalResolves()).toEqual([6]);
  });

  it("a root insert warms only the ids it resolved; a read that did not select LoginName still warms nothing", async () => {
    await insert([person(6)]);
    await p.getItemsByIdsAsync(principals, [12], ["Id", "Title"]);
    await insert([person([6, 12], true)], "/sites/dev/Projects/F");
    expect(p.principalResolves()).toEqual([6, 12]);
  });

  it("fails the operation for a principal the site has never seen, on both paths", async () => {
    const inFolder = await insert([person(999)], "/sites/dev/Projects/F");
    expect(inFolder).toMatchObject({ kind: "failure", status: 400 });
    expect(String((inFolder as { body: unknown }).body)).toMatch(/999/);
    const atRoot = await insert([person(999)]);
    expect(atRoot).toMatchObject({ kind: "failure", status: 400 });
    expect(await p.countAsync(list)).toBe(0);
  });

  it("fails the operation for an unknown provider key on the target", async () => {
    // The `provider` source kind arrives with step 2 of the principals work; the
    // fake's routing is already forward-compatible with it.
    const nope = stubEntityType("Nope", {
      kind: "provider",
      key: "nope",
    } as unknown as EntitySource);
    const res = await insert([
      { property: lookupProperty("Owner", nope), value: 6 },
    ]);
    expect(res).toMatchObject({ kind: "failure", status: 400 });
    expect(String((res as { body: unknown }).body)).toMatch(/'nope'/);
  });

  it("update.fields stores typed values, null as a clear, and checks person columns like insert", async () => {
    const when = new Date(Date.UTC(2027, 2, 15, 12));
    const later = new Date(Date.UTC(2028, 0, 1));
    const id = p.seedRow(list, { Title: "t", StartDate: when, RepoUrl: "r" });
    const [ok] = await p.executeBatchAsync([
      {
        kind: "update",
        list,
        id,
        fields: [
          { property: dateTimeProperty("StartDate"), value: later },
          { property: textProperty("RepoUrl"), value: null },
          person(6),
        ],
        etag: "*",
        clientToken: "u",
      },
    ]);
    expect(ok).toEqual({ kind: "success", clientToken: "u" });
    const row = await p.getItemByIdAsync(list, id, [
      "Title",
      "StartDate",
      "RepoUrl",
      "OwnerId",
    ]);
    expect(row).toEqual({
      ID: id,
      Title: "t",
      StartDate: later,
      RepoUrl: null,
      OwnerId: 6,
    });
    expect(p.principalResolves()).toEqual([6]);
    const [bad] = await p.executeBatchAsync([
      {
        kind: "update",
        list,
        id,
        fields: [person(999)],
        etag: "*",
        clientToken: "v",
      },
    ]);
    expect(bad).toMatchObject({ kind: "failure", status: 400 });
    expect(String((bad as { body: unknown }).body)).toMatch(/999/);
    // A refused update changed nothing.
    expect((await p.getItemByIdAsync(list, id, ["OwnerId"]))?.OwnerId).toBe(6);
  });

  it("update.fields: a null single-person value clears the column — no principal named, no resolve logged", async () => {
    // `null` names no principal (it is not "principal 0"): the same rule the real
    // provider's principalIdOf applies, so the registry is never consulted.
    const id = p.seedRow(list, { Title: "t", OwnerId: 6 });
    const [res] = await p.executeBatchAsync([
      {
        kind: "update",
        list,
        id,
        fields: [person(null)],
        etag: "*",
        clientToken: "clear",
      },
    ]);
    expect(res).toEqual({ kind: "success", clientToken: "clear" });
    expect(await p.getItemByIdAsync(list, id, ["OwnerId"])).toEqual({
      ID: id,
      OwnerId: null,
    });
    expect(p.principalResolves()).toEqual([]);
  });

  it("applies typed upload metadata to the implicitly-created item", async () => {
    const lib = { kind: "title" as const, value: "Docs" };
    const r = await p.uploadFileAsync(lib, null, {
      fileName: "a.txt",
      content: "x",
      overwrite: true,
      fields: [{ property: TITLE, value: "typed" }],
    });
    const row = await p.getItemByIdAsync(lib, r.id, ["Title"]);
    expect(row?.Title).toBe("typed");
  });

  it("an upload whose typed metadata names an unknown principal throws before anything is uploaded — no file, no item, no id taken", async () => {
    // The real provider resolves every principal `fields` names before a byte
    // moves, so a refused principal leaves nothing behind; the fake must agree,
    // not commit the file and item and then throw.
    const lib = { kind: "title" as const, value: "Docs" };
    await expect(
      p.uploadFileAsync(lib, null, {
        fileName: "a.txt",
        content: "x",
        overwrite: true,
        fields: [person(999)],
      }),
    ).rejects.toThrow(/Field 'OwnerId'.*999/);
    expect(p.getFiles(lib)).toEqual([]);
    expect(await p.getItemByIdAsync(lib, 1, ["ID"])).toBeNull();
    expect(await p.countAsync(lib)).toBe(0);
    // The would-be id was never taken: the next upload gets it.
    const ok = await p.uploadFileAsync(lib, null, {
      fileName: "a.txt",
      content: "x",
      overwrite: true,
      fields: [person(6)],
    });
    expect(ok.id).toBe(1);
  });
});

describe("FakeStorageProvider insert — a principal with no login", () => {
  const ghost = 40;
  beforeEach(() => {
    p.seedPrincipal({
      Id: ghost,
      Title: "Ghost",
      LoginName: "",
      PrincipalType: 1,
    });
  });

  it("fails the operation on both paths, naming the id and the field — a person column is written by claims Key", async () => {
    // The real provider needs the login to spell the Key and refuses an empty one on
    // the root path too (firstUnresolvedPrincipal treats "" as unresolved).
    const inFolder = await insert([person(ghost)], "/sites/dev/Projects/F");
    expect(inFolder).toMatchObject({ kind: "failure", status: 400 });
    expect(String((inFolder as { body: unknown }).body)).toMatch(
      /Owner.*40.*no login|40.*Owner.*no login/,
    );
    const atRoot = await insert([person(ghost)]);
    expect(atRoot).toMatchObject({ kind: "failure", status: 400 });
    expect(String((atRoot as { body: unknown }).body)).toMatch(/40/);
    expect(await p.countAsync(list)).toBe(0);
  });

  it("a read that returned the empty login warms nothing: the insert still resolves, and still fails", async () => {
    // projectPrincipal hands the empty string out (the column was selected and the
    // seed holds it) but must not count it as a login the provider can write with.
    const [row] = await p.getItemsByIdsAsync(
      principals,
      [ghost],
      ["Id", "LoginName"],
    );
    expect(row).toEqual({ Id: ghost, LoginName: "" });
    const res = await insert([person(ghost)], "/sites/dev/Projects/F");
    expect(res).toMatchObject({ kind: "failure", status: 400 });
    expect(p.principalResolves()).toEqual([ghost]);
  });
});
