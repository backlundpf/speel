import type {
  IStorageProvider,
  IFileSystem,
  IChangeFeed,
  IListHandle,
  IProviderSource,
  IWriteField,
  IBatchOperationResult,
  IGetItemsOptions,
} from "../../providers/ISharePointProvider.js";
import type { Property } from "../../Metadata/Property.js";
import {
  assertTrue,
  assertEqual,
  assertRejects,
  sortedNumbers,
} from "./assert.js";

export interface IConformancePrincipal {
  Id: number;
  Title: string;
  LoginName: string;
}

/**
 * What an environment supplies so the suite can run against its provider. Every
 * member is something the cases genuinely need: a list to write into, the model's
 * properties for the columns on it (the suite exercises exactly the metadata core
 * sends), and two ways of looking at the world that do NOT go through the provider
 * under test — because a suite that verifies a write by asking the thing that
 * wrote it proves nothing, and SharePoint answers 200 to writes it discards.
 */
export interface IProviderConformanceHarness {
  /**
   * A fresh provider instance — its principal cache must be empty when the suite
   * starts. The suite exercises all three parts of the contract, so a provider
   * under test must implement every one.
   */
  provider: IStorageProvider & IFileSystem & IChangeFeed;
  /** The list the suite inserts into. */
  list: IListHandle;
  /** Fields every insert must carry for `list` to accept the row (its required columns). */
  baseFields: readonly IWriteField[];
  /** The properties the suite writes and reads back, from the harness's model. */
  properties: {
    text: Property;
    boolean: Property;
    dateTime: Property;
    multiChoice: Property;
    /** Multi-value lookup to `lookupTarget`; its FK column is `${name}Id`. */
    multiLookup: Property;
    person: Property;
    multiPerson: Property;
  };
  /** The library's Title property. */
  libraryTitle: Property;
  /** Two values legal for `properties.multiChoice`. */
  multiChoiceValues: readonly [string, string];
  /** The list `properties.multiLookup` points at; holds at least two rows. */
  lookupTarget: IListHandle;
  /** A list-relative folder path under `list` the suite may create ('a/b' form). */
  folderPath: string;
  /** A document library with a `Title` column. */
  library: IListHandle;
  /**
   * One user (with an email) and one SharePoint group, found WITHOUT the provider
   * under test — raw REST live, the seeds in a unit run — so the first write that
   * names them is a cold resolve. Both must be valid in a person column of `list`.
   */
  principals(): Promise<{
    user: IConformancePrincipal & { Email: string };
    /** A second user, distinct from `user`, that no case before the root-path case names. */
    secondUser: IConformancePrincipal & { Email: string };
    group: IConformancePrincipal;
  }>;
  /** One stored row, by a route independent of the provider (REST live, the store in a unit run). */
  readBack(
    list: IListHandle,
    id: number,
    columns: readonly string[],
  ): Promise<Record<string, unknown>>;
  /**
   * How many of `ids` the provider asked its backing store to resolve while `fn`
   * ran (User Information List URL mentions live, the fake's resolve log in a unit run).
   */
  countPrincipalResolves(
    ids: readonly number[],
    fn: () => Promise<void>,
  ): Promise<number>;
}

export interface IConformanceCase {
  name: string;
  run(): Promise<void>;
}

const PRINCIPALS: IProviderSource = { kind: "provider", key: "principals" };
const SITE_USERS: IProviderSource = { kind: "provider", key: "siteUsers" };
const SITE_GROUPS: IProviderSource = { kind: "provider", key: "siteGroups" };
const PRINCIPAL_FIELDS = ["Id", "Title", "LoginName", "Email", "PrincipalType"];
const GROUP_FIELDS = [...PRINCIPAL_FIELDS, "Description", "OwnerTitle"];
/** An id no site has issued: the UIL is a list, and list ids are Int32. */
const NEVER_AN_ID = 2_147_483_000;

function eq(column: string, value: unknown): IGetItemsOptions {
  return { filter: { kind: "compare", column, op: "eq", value } };
}

/** The column each harness property reads back as — a lookup's is its FK column already. */
function columnsOf<K extends string>(
  properties: Record<K, Property>,
): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of Object.keys(properties) as K[]) {
    out[k] = properties[k].columnName;
  }
  return out;
}

/**
 * The cases, in the order they MUST run: writes first, because the cold-resolve
 * cases need principals no read has returned yet and the read cases return every
 * site user — and within the writes, the two cold-premise folder cases before any
 * other write that names the same principals: whether a root insert resolves them
 * is the implementation's business (SharePoint's `items.add` does not check a
 * person id, so a live provider must), and the premise must not depend on it.
 * All cases share `h.provider`.
 */
export function providerConformanceCases(
  h: IProviderConformanceHarness,
): readonly IConformanceCase[] {
  let tokens = 0;
  const token = () => `conf-${++tokens}`;

  async function drain(
    source: IProviderSource | IListHandle,
    fields: readonly string[],
    options?: IGetItemsOptions,
  ): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    // A provider that never clears nextCursor must fail with a message, not hang a
    // browser test into a timeout that names nothing.
    for (let pages = 0; pages < 200; pages++) {
      const page = await h.provider.getItemsPagedAsync(
        source,
        fields,
        100,
        cursor,
        options,
      );
      out.push(...page.items);
      if (!page.nextCursor) return out;
      cursor = page.nextCursor;
    }
    const sourceLabel =
      source.kind === "provider"
        ? `provider:${source.key}`
        : `${source.kind}:${source.value}`;
    throw new Error(
      `drain: ${sourceLabel} did not exhaust after 200 pages — nextCursor never cleared`,
    );
  }

  async function insert(
    fields: readonly IWriteField[],
    folderServerRelativeUrl: string | null,
  ): Promise<IBatchOperationResult> {
    const [res] = await h.provider.executeBatchAsync([
      {
        kind: "insert",
        list: h.list,
        fields: [...h.baseFields, ...fields],
        folderServerRelativeUrl,
        clientToken: token(),
      },
    ]);
    return res!;
  }

  function idOf(res: IBatchOperationResult, what: string): number {
    assertTrue(
      res.kind === "success",
      `${what}: expected success, got ${res.kind === "failure" ? `${res.status} ${JSON.stringify(res.body)}` : res.kind}`,
    );
    const id = res.serverData?.id;
    assertTrue(typeof id === "number" && id > 0, `${what}: no id came back`);
    return id;
  }

  /**
   * Cleanup, always from a `finally`: it must never throw (that would mask the
   * case's real failure) but a row left behind must not pass in silence either.
   */
  async function remove(list: IListHandle, id: number): Promise<void> {
    const [res] = await h.provider.executeBatchAsync([
      {
        kind: "delete",
        list,
        id,
        etag: "*",
        permanent: true,
        clientToken: token(),
      },
    ]);
    if (res?.kind === "failure") {
      console.warn(
        `conformance: cleanup of ${list.value}/${id} failed: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
  }

  async function folderUrl(): Promise<string> {
    const urls = await h.provider.ensureFoldersAsync(h.list, [h.folderPath]);
    const url = urls.get(h.folderPath);
    assertTrue(!!url, `ensureFoldersAsync did not resolve '${h.folderPath}'`);
    return url;
  }

  async function twoLookupIds(): Promise<number[]> {
    const rows = await h.provider.getItemsPagedAsync(h.lookupTarget, ["Id"], 2);
    // A list read answers `Id` live and `ID` from the fake's projection; take either.
    const ids = rows.items.map((r) => Number(r.Id ?? r.ID));
    assertTrue(
      ids.length === 2 && ids.every(Number.isFinite),
      `lookupTarget must hold at least two rows with numeric ids (got ${JSON.stringify(rows.items)})`,
    );
    return ids;
  }

  function person(id: number | number[], multi: boolean): IWriteField {
    return {
      property: multi ? h.properties.multiPerson : h.properties.person,
      value: id,
    };
  }

  // The page-side `names()` (samples/spfx-sample, Task 9) enumerates the cases with
  // an EMPTY harness: keep construction lazy — no `h.*` dereference outside `run()`.
  // (`h.properties` may be undefined here; `c.x` is only read inside a run.)
  const c = h.properties;

  return [
    // ---------------------------------------------------------------- writes
    {
      name: "a folder insert naming a principal no read has returned resolves it exactly once, and never again",
      async run() {
        const { user } = await h.principals();
        const folder = await folderUrl();
        const ids: number[] = [];
        try {
          const cold = await h.countPrincipalResolves([user.Id], async () => {
            ids.push(
              idOf(
                await insert([person(user.Id, false)], folder),
                "cold folder insert",
              ),
            );
          });
          assertEqual(cold, 1, "cold insert: resolves of the user");
          const row = await h.readBack(h.list, ids[0]!, [
            c.person.columnName,
            "FileDirRef",
          ]);
          assertEqual(
            Number(row[c.person.columnName]),
            user.Id,
            "person FK column after a folder insert",
          );
          assertTrue(
            String(row.FileDirRef).endsWith(`/${h.folderPath}`),
            `FileDirRef '${String(row.FileDirRef)}' does not end with '/${h.folderPath}'`,
          );
          const warm = await h.countPrincipalResolves([user.Id], async () => {
            ids.push(
              idOf(
                await insert([person(user.Id, false)], folder),
                "warm folder insert",
              ),
            );
          });
          assertEqual(warm, 0, "second insert of the same principal: resolves");
        } finally {
          for (const id of ids) await remove(h.list, id);
        }
      },
    },
    {
      name: "a folder insert naming a principal a provider-source read returned resolves nothing",
      async run() {
        const { group } = await h.principals();
        const [seen] = await h.provider.getItemsByIdsAsync(
          SITE_GROUPS,
          [group.Id],
          ["Id", "Title", "LoginName"],
        );
        assertTrue(
          !!seen && seen.LoginName === group.LoginName,
          "siteGroups read did not return the group with its LoginName",
        );
        const folder = await folderUrl();
        let id = 0;
        try {
          const resolves = await h.countPrincipalResolves(
            [group.Id],
            async () => {
              id = idOf(
                await insert([person(group.Id, false)], folder),
                "folder insert of a read group",
              );
            },
          );
          assertEqual(resolves, 0, "resolves after a read");
          const row = await h.readBack(h.list, id, [c.person.columnName]);
          assertEqual(
            Number(row[c.person.columnName]),
            group.Id,
            "a group in a person column",
          );
        } finally {
          if (id) await remove(h.list, id);
        }
      },
    },
    {
      name: "a root insert naming a principal no read has returned resolves it exactly once, and never again",
      async run() {
        // SharePoint's `items.add` stores a dangling person id without complaint, so
        // a live provider must resolve a cold principal on the root path too — once.
        const { secondUser } = await h.principals();
        const ids: number[] = [];
        try {
          const cold = await h.countPrincipalResolves(
            [secondUser.Id],
            async () => {
              ids.push(
                idOf(
                  await insert([person(secondUser.Id, false)], null),
                  "cold root insert",
                ),
              );
            },
          );
          assertEqual(cold, 1, "cold root insert: resolves of the user");
          const row = await h.readBack(h.list, ids[0]!, [c.person.columnName]);
          assertEqual(
            Number(row[c.person.columnName]),
            secondUser.Id,
            "person FK column after a root insert",
          );
          const warm = await h.countPrincipalResolves(
            [secondUser.Id],
            async () => {
              ids.push(
                idOf(
                  await insert([person(secondUser.Id, false)], null),
                  "warm root insert",
                ),
              );
            },
          );
          assertEqual(
            warm,
            0,
            "second root insert of the same principal: resolves",
          );
        } finally {
          for (const id of ids) await remove(h.list, id);
        }
      },
    },
    {
      name: "insert at the list root round-trips every field kind",
      async run() {
        const { user, group } = await h.principals();
        const lookupIds = await twoLookupIds();
        const when = new Date(Date.UTC(2027, 2, 15, 12));
        const text = `conformance ${Date.now()}`;
        const res = await insert(
          [
            { property: c.text, value: text },
            { property: c.boolean, value: true },
            { property: c.dateTime, value: when },
            { property: c.multiChoice, value: [...h.multiChoiceValues] },
            { property: c.multiLookup, value: lookupIds },
            person(user.Id, false),
            person([user.Id, group.Id], true),
          ],
          null,
        );
        const id = idOf(res, "root insert");
        try {
          const k = columnsOf(c);
          const row = await h.readBack(h.list, id, [
            k.text,
            k.boolean,
            k.dateTime,
            k.multiChoice,
            k.multiLookup,
            k.person,
            k.multiPerson,
          ]);
          assertEqual(row[k.text], text, "text column");
          assertEqual(row[k.boolean], true, "boolean column");
          // readBack is the INDEPENDENT route, not the typed provider read: raw REST
          // live, the fake's store in a unit run. So the column arrives in whatever
          // shape that route holds — an ISO string live, the very Date the fake
          // stored — and both are legitimate here. What this case pins is the
          // INSTANT the write landed; the provider's typing of the same column is
          // the typed round-trip case's job, below.
          const rawDate = row[k.dateTime];
          const stored =
            rawDate instanceof Date
              ? rawDate.getTime()
              : Date.parse(String(rawDate));
          // A date-only column keeps the date in the SITE's zone; any zone keeps noon UTC on the same day within a day.
          assertTrue(
            Math.abs(stored - when.getTime()) <= 24 * 3_600_000,
            `dateTime column: stored ${String(rawDate)}, sent ${when.toISOString()}`,
          );
          assertTrue(
            Array.isArray(row[k.multiChoice]),
            `${k.multiChoice}: expected an array, got ${JSON.stringify(row[k.multiChoice])}`,
          );
          assertEqual(
            [...(row[k.multiChoice] as string[])].sort(),
            [...h.multiChoiceValues].sort(),
            "multi-choice column",
          );
          assertEqual(
            sortedNumbers(row[k.multiLookup]),
            sortedNumbers(lookupIds),
            "multi-lookup FK column",
          );
          assertEqual(Number(row[k.person]), user.Id, "person FK column");
          assertEqual(
            sortedNumbers(row[k.multiPerson]),
            sortedNumbers([user.Id, group.Id]),
            "multi-person FK column",
          );
        } finally {
          await remove(h.list, id);
        }
      },
    },
    {
      name: "a folder insert round-trips multi-value person, lookup and choice columns",
      async run() {
        const { user, group } = await h.principals();
        const lookupIds = await twoLookupIds();
        const folder = await folderUrl();
        const id = idOf(
          await insert(
            [
              person([user.Id, group.Id], true),
              { property: c.multiLookup, value: lookupIds },
              { property: c.multiChoice, value: [...h.multiChoiceValues] },
            ],
            folder,
          ),
          "folder insert with multi-value columns",
        );
        try {
          const k = columnsOf(c);
          const row = await h.readBack(h.list, id, [
            k.multiPerson,
            k.multiLookup,
            k.multiChoice,
          ]);
          assertEqual(
            sortedNumbers(row[k.multiPerson]),
            sortedNumbers([user.Id, group.Id]),
            "multi-person FK column",
          );
          assertEqual(
            sortedNumbers(row[k.multiLookup]),
            sortedNumbers(lookupIds),
            "multi-lookup FK column",
          );
          assertTrue(
            Array.isArray(row[k.multiChoice]),
            `${k.multiChoice}: expected an array, got ${JSON.stringify(row[k.multiChoice])}`,
          );
          assertEqual(
            [...(row[k.multiChoice] as string[])].sort(),
            [...h.multiChoiceValues].sort(),
            "multi-choice column",
          );
        } finally {
          await remove(h.list, id);
        }
      },
    },
    {
      name: "a folder insert naming a principal the site has never seen fails the operation instead of storing nothing",
      async run() {
        const folder = await folderUrl();
        const res = await insert([person(NEVER_AN_ID, false)], folder);
        if (res.kind === "success") {
          await remove(h.list, res.serverData!.id);
          throw new Error("insert of an unknown principal reported success");
        }
        assertTrue(
          String(res.body).includes(String(NEVER_AN_ID)),
          `failure body does not name the id: ${String(res.body)}`,
        );
      },
    },
    {
      // SharePoint itself does not fail this: `items.add` answers 201 to a person id
      // the site has never issued and stores a dangling reference (verified live).
      // The provider must, and name the id like its folder twin.
      name: "a root insert naming a principal the site has never seen fails the operation",
      async run() {
        const res = await insert([person(NEVER_AN_ID, false)], null);
        if (res.kind === "success") {
          await remove(h.list, res.serverData!.id);
          throw new Error(
            "root insert of an unknown principal reported success",
          );
        }
        assertTrue(
          String(res.body).includes(String(NEVER_AN_ID)),
          `failure body does not name the id: ${String(res.body)}`,
        );
      },
    },
    {
      name: "uploadFileAsync applies typed fields as the new item's metadata",
      async run() {
        const title = `conformance upload ${Date.now()}`;
        const r = await h.provider.uploadFileAsync(h.library, null, {
          fileName: `speel-conformance-${Date.now()}.txt`,
          content: "conformance",
          overwrite: true,
          fields: [{ property: h.libraryTitle, value: title }],
        });
        try {
          const col = h.libraryTitle.columnName;
          const row = await h.readBack(h.library, r.id, [col]);
          assertEqual(row[col], title, "uploaded item Title");
        } finally {
          await remove(h.library, r.id);
        }
      },
    },
    // The three typed cases: they write, so they sit with the writes, and they name
    // only principals the cases above have already warmed — no cold premise moves.
    {
      name: "typed insert round-trip: the provider returns Date, boolean and arrays for described columns",
      async run() {
        const { user, group } = await h.principals();
        const lookupIds = await twoLookupIds();
        const when = new Date(Date.UTC(2027, 5, 1, 12));
        const id = idOf(
          await insert(
            [
              { property: c.dateTime, value: when },
              { property: c.boolean, value: true },
              { property: c.multiChoice, value: [...h.multiChoiceValues] },
              { property: c.multiLookup, value: lookupIds },
              { property: c.multiPerson, value: [user.Id, group.Id] },
            ],
            null,
          ),
          "typed insert",
        );
        try {
          const described = [
            c.dateTime,
            c.boolean,
            c.multiChoice,
            c.multiLookup,
            c.multiPerson,
          ];
          const cols = described.map((p) => p.columnName);
          const typed = await h.provider.getItemByIdAsync(h.list, id, cols, {
            properties: described,
          });
          assertTrue(!!typed, "typed read returned null");
          assertTrue(
            typed[c.dateTime.columnName] instanceof Date,
            `${c.dateTime.columnName}: not a Date: ${JSON.stringify(typed[c.dateTime.columnName])}`,
          );
          assertTrue(
            Math.abs(
              (typed[c.dateTime.columnName] as Date).getTime() - when.getTime(),
            ) <=
              24 * 3_600_000,
            "Date instant",
          );
          assertEqual(
            typeof typed[c.boolean.columnName],
            "boolean",
            "boolean column type",
          );
          assertTrue(
            Array.isArray(typed[c.multiChoice.columnName]) &&
              (typed[c.multiChoice.columnName] as unknown[]).every(
                (v) => typeof v === "string",
              ),
            "multi-choice is string[]",
          );
          assertTrue(
            Array.isArray(typed[c.multiLookup.columnName]) &&
              (typed[c.multiLookup.columnName] as unknown[]).every(
                (v) => typeof v === "number",
              ),
            "multi-lookup is number[]",
          );
          assertTrue(
            Array.isArray(typed[c.multiPerson.columnName]) &&
              (typed[c.multiPerson.columnName] as unknown[]).every(
                (v) => typeof v === "number",
              ),
            "multi-person is number[]",
          );
          // Type parity with the independent route for a read WITHOUT properties.
          // Against the fake this block compares a value with itself: the unit
          // harness's readBack IS the fake's own untyped getItemByIdAsync, so it
          // can kill nothing there. It bites only live, where readBack is raw REST:
          // the wire holds an ISO string, and an untyped read that typed the column
          // anyway would answer a Date — the shape check below is what catches
          // that, not the value equality (which JSON-canonicalises a Date to its
          // ISO string and would differ from the wire only by ".000"). The as-is
          // rule itself is pinned where a wire exists to be as-is to: @speel/pnpjs
          // test/readValues.test.ts "returns the record as-is when no properties
          // are given" and test/SharePointProvider.typedReads.test.ts "returns the
          // ISO string as-is without properties".
          const raw = await h.provider.getItemByIdAsync(h.list, id, cols);
          assertTrue(!!raw, "untyped read returned null");
          const independent = await h.readBack(h.list, id, [
            c.dateTime.columnName,
          ]);
          assertEqual(
            raw[c.dateTime.columnName] instanceof Date,
            independent[c.dateTime.columnName] instanceof Date,
            `${c.dateTime.columnName}: untyped read must have the same shape as the independent route`,
          );
          assertEqual(
            raw[c.dateTime.columnName],
            independent[c.dateTime.columnName],
            "without properties the date comes back as the wire has it",
          );
        } finally {
          await remove(h.list, id);
        }
      },
    },
    {
      name: "typed update: a changed Date is stored and a null clears the column",
      async run() {
        const first = new Date(Date.UTC(2027, 5, 1, 12));
        const second = new Date(Date.UTC(2027, 6, 1, 12));
        const id = idOf(
          await insert(
            [
              { property: c.dateTime, value: first },
              { property: c.text, value: "before" },
            ],
            null,
          ),
          "insert for update",
        );
        try {
          const [res] = await h.provider.executeBatchAsync([
            {
              kind: "update",
              list: h.list,
              id,
              fields: [
                { property: c.dateTime, value: second },
                { property: c.text, value: null },
              ],
              etag: "*",
              clientToken: token(),
            },
          ]);
          assertTrue(res?.kind === "success", `update: ${JSON.stringify(res)}`);
          const row = await h.readBack(h.list, id, [
            c.dateTime.columnName,
            c.text.columnName,
          ]);
          assertTrue(
            Math.abs(
              Date.parse(String(row[c.dateTime.columnName])) - second.getTime(),
            ) <=
              24 * 3_600_000,
            "updated Date",
          );
          assertTrue(
            row[c.text.columnName] === null ||
              row[c.text.columnName] === undefined ||
              row[c.text.columnName] === "",
            `cleared text column still holds ${JSON.stringify(row[c.text.columnName])}`,
          );
        } finally {
          await remove(h.list, id);
        }
      },
    },
    {
      name: "typed update: an empty array clears a multi-value column",
      async run() {
        const lookupIds = await twoLookupIds();
        const id = idOf(
          await insert(
            [
              { property: c.multiLookup, value: lookupIds },
              { property: c.multiChoice, value: [...h.multiChoiceValues] },
            ],
            null,
          ),
          "insert for multi clear",
        );
        try {
          const [res] = await h.provider.executeBatchAsync([
            {
              kind: "update",
              list: h.list,
              id,
              fields: [
                { property: c.multiLookup, value: [] },
                { property: c.multiChoice, value: [] },
              ],
              etag: "*",
              clientToken: token(),
            },
          ]);
          assertTrue(res?.kind === "success", `update: ${JSON.stringify(res)}`);
          const row = await h.readBack(h.list, id, [
            c.multiLookup.columnName,
            c.multiChoice.columnName,
          ]);
          // Live may answer `null` or `""` for a cleared column; both mean cleared.
          const cleared = (v: unknown): unknown =>
            v == null || v === "" ? [] : v;
          assertEqual(
            sortedNumbers(cleared(row[c.multiLookup.columnName])),
            [],
            "multi-lookup cleared",
          );
          assertEqual(
            cleared(row[c.multiChoice.columnName]),
            [],
            "multi-choice cleared",
          );
        } finally {
          await remove(h.list, id);
        }
      },
    },
    // ----------------------------------------------------------------- reads
    {
      name: "siteUsers returns records in model spelling, every one carrying a numeric PrincipalType",
      async run() {
        const { user, group } = await h.principals();
        const rows = await drain(SITE_USERS, PRINCIPAL_FIELDS);
        assertTrue(rows.length > 0, "siteUsers returned nothing");
        for (const r of rows) {
          assertTrue(
            typeof r.Id === "number",
            `Id is not a number: ${JSON.stringify(r)}`,
          );
          assertTrue(
            typeof r.PrincipalType === "number",
            `PrincipalType missing: ${JSON.stringify(r)}`,
          );
          // web/siteusers carries claims security groups (4), never SharePoint groups.
          assertTrue(
            r.PrincipalType !== 8,
            `a SharePoint group leaked into siteUsers: ${JSON.stringify(r)}`,
          );
          assertTrue(
            typeof r.LoginName === "string",
            `LoginName missing: ${JSON.stringify(r)}`,
          );
          for (const raw of ["Name", "EMail", "ContentTypeId"]) {
            assertTrue(
              !(raw in r),
              `endpoint spelling '${raw}' leaked: ${JSON.stringify(r)}`,
            );
          }
        }
        const me = rows.find((r) => r.Id === user.Id);
        assertTrue(
          !!me && me.LoginName === user.LoginName && me.PrincipalType === 1,
          "the harness user is not among siteUsers as a user",
        );
        assertTrue(
          !rows.some((r) => r.Id === group.Id),
          "the harness group is among siteUsers",
        );
      },
    },
    {
      name: "siteGroups returns records in model spelling, every one a SharePoint group",
      async run() {
        const { group } = await h.principals();
        const rows = await drain(SITE_GROUPS, GROUP_FIELDS);
        assertTrue(rows.length > 0, "siteGroups returned nothing");
        for (const r of rows) {
          assertEqual(
            r.PrincipalType,
            8,
            `PrincipalType of ${JSON.stringify(r)}`,
          );
          assertTrue(
            typeof r.LoginName === "string",
            `LoginName missing: ${JSON.stringify(r)}`,
          );
        }
        const g = rows.find((r) => r.Id === group.Id);
        assertTrue(
          !!g && g.Title === group.Title,
          "the harness group is not among siteGroups",
        );
      },
    },
    {
      name: "siteGroups drained at page size 2 equals the page-100 drain",
      async run() {
        // The first exercise of $skip on the `web/` collections: a tenant's groups
        // fit in one page, so only a deliberately small page size walks the offset.
        const large = await drain(SITE_GROUPS, ["Id", "Title"]);
        assertTrue(
          large.length >= 2,
          "the site needs at least two groups for a paging test",
        );
        const small: Record<string, unknown>[] = [];
        let cursor: string | undefined;
        for (let pages = 0; pages < 200; pages++) {
          const page = await h.provider.getItemsPagedAsync(
            SITE_GROUPS,
            ["Id", "Title"],
            2,
            cursor,
          );
          assertTrue(
            page.items.length <= 2,
            `page ${pages} returned ${page.items.length} rows for a page size of 2`,
          );
          small.push(...page.items);
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }
        assertEqual(
          sortedNumbers(small.map((r) => r.Id as number)),
          sortedNumbers(large.map((r) => r.Id as number)),
          "ids: small pages vs one page",
        );
        assertEqual(
          new Set(small.map((r) => r.Id)).size,
          small.length,
          "a small-page drain repeats no id",
        );
      },
    },
    {
      name: "principals resolves users and groups by id in one read, deriving PrincipalType",
      async run() {
        const { user, group } = await h.principals();
        const [u, g, missing] = await h.provider.getItemsByIdsAsync(
          PRINCIPALS,
          [user.Id, group.Id, NEVER_AN_ID],
          PRINCIPAL_FIELDS,
        );
        assertTrue(!!u, "user missing from principals");
        assertTrue(!!g, "group missing from principals");
        assertEqual(missing, null, "a never-issued id");
        assertEqual(u.PrincipalType, 1, "user PrincipalType via the UIL");
        assertEqual(u.LoginName, user.LoginName, "user LoginName via the UIL");
        assertEqual(u.Email, user.Email, "user Email via the UIL");
        assertEqual(g.PrincipalType, 8, "group PrincipalType via the UIL");
        assertEqual(
          g.LoginName,
          group.LoginName,
          "group LoginName via the UIL",
        );
        for (const rec of [u, g]) {
          for (const raw of ["Name", "EMail", "ContentTypeId"]) {
            assertTrue(
              !(raw in rec),
              `endpoint spelling '${raw}' leaked: ${JSON.stringify(rec)}`,
            );
          }
        }
      },
    },
    {
      name: "the same principal reads identically from every key that carries it",
      async run() {
        const { user, group } = await h.principals();
        const core = ["Id", "Title", "LoginName"];
        const [uilUser] = await h.provider.getItemsByIdsAsync(
          PRINCIPALS,
          [user.Id],
          core,
        );
        const [siteUser] = await h.provider.getItemsByIdsAsync(
          SITE_USERS,
          [user.Id],
          core,
        );
        assertEqual(uilUser, siteUser, "user via principals vs siteUsers");
        const [uilGroup] = await h.provider.getItemsByIdsAsync(
          PRINCIPALS,
          [group.Id],
          core,
        );
        const [siteGroup] = await h.provider.getItemsByIdsAsync(
          SITE_GROUPS,
          [group.Id],
          core,
        );
        assertEqual(uilGroup, siteGroup, "group via principals vs siteGroups");
      },
    },
    {
      name: "getItemByIdAsync agrees with the by-ids read for every key, and misses are null",
      async run() {
        const { user, group } = await h.principals();
        for (const [source, id, fields] of [
          [PRINCIPALS, user.Id, PRINCIPAL_FIELDS],
          [SITE_USERS, user.Id, PRINCIPAL_FIELDS],
          [SITE_GROUPS, group.Id, GROUP_FIELDS],
        ] as const) {
          const one = await h.provider.getItemByIdAsync(source, id, fields);
          const [many] = await h.provider.getItemsByIdsAsync(
            source,
            [id],
            fields,
          );
          // Two nulls agree too; the comparison only means something for a hit.
          assertTrue(
            one !== null,
            `${source.key}: getItemByIdAsync returned null for a real id`,
          );
          assertEqual(one, many, `${source.key} single vs by-ids`);
          assertEqual(
            await h.provider.getItemByIdAsync(source, NEVER_AN_ID, fields),
            null,
            `${source.key} miss`,
          );
        }
      },
    },
    {
      name: "a selected column the key cannot carry is omitted, not an error",
      async run() {
        const { user, group } = await h.principals();
        const [u] = await h.provider.getItemsByIdsAsync(
          SITE_USERS,
          [user.Id],
          ["Id", "Title", "Description", "OwnerTitle"],
        );
        assertTrue(!!u && u.Title !== undefined, "siteUsers read failed");
        assertTrue(
          !("Description" in u) && !("OwnerTitle" in u),
          `group-only columns present on a site user: ${JSON.stringify(u)}`,
        );
        const [g] = await h.provider.getItemsByIdsAsync(
          SITE_GROUPS,
          [group.Id],
          ["Id", "Title", "Email"],
        );
        assertTrue(
          !!g && !("Email" in g),
          `Email present on a site group: ${JSON.stringify(g)}`,
        );
      },
    },
    {
      name: "where: equality on LoginName and Email reaches the principals source",
      async run() {
        const { user } = await h.principals();
        const byLogin = await drain(
          PRINCIPALS,
          ["Id"],
          eq("LoginName", user.LoginName),
        );
        assertEqual(
          byLogin.map((r) => r.Id),
          [user.Id],
          "LoginName eq",
        );
        const byEmail = await drain(
          PRINCIPALS,
          ["Id"],
          eq("Email", user.Email),
        );
        assertEqual(
          byEmail.map((r) => r.Id),
          [user.Id],
          "Email eq",
        );
      },
    },
    {
      name: "where: PrincipalType on the principals source separates users from groups, and rejects values it cannot express",
      async run() {
        const { user, group } = await h.principals();
        const users = await drain(
          PRINCIPALS,
          ["Id", "PrincipalType"],
          eq("PrincipalType", 1),
        );
        assertTrue(
          users.every((r) => r.PrincipalType === 1),
          "PrincipalType eq 1 returned a non-user",
        );
        assertTrue(
          users.some((r) => r.Id === user.Id),
          "PrincipalType eq 1 omitted the user",
        );
        assertTrue(
          !users.some((r) => r.Id === group.Id),
          "PrincipalType eq 1 included the group",
        );
        const groups = await drain(
          PRINCIPALS,
          ["Id", "PrincipalType"],
          eq("PrincipalType", 8),
        );
        assertTrue(
          groups.every((r) => r.PrincipalType === 8),
          "PrincipalType eq 8 returned a non-group",
        );
        assertTrue(
          groups.some((r) => r.Id === group.Id),
          "PrincipalType eq 8 omitted the group",
        );
        await assertRejects(
          () => drain(PRINCIPALS, ["Id"], eq("PrincipalType", 4)),
          "QueryTranslationException",
          "PrincipalType eq 4 on the principals source",
        );
      },
    },
    {
      name: "where: equality and startsWith on Title reach the collection sources",
      async run() {
        const { user, group } = await h.principals();
        const users = await drain(SITE_USERS, ["Id"], eq("Title", user.Title));
        assertTrue(
          users.some((r) => r.Id === user.Id),
          "siteUsers Title eq omitted the user",
        );
        const groups = await drain(
          SITE_GROUPS,
          ["Id"],
          eq("Title", group.Title),
        );
        assertEqual(
          groups.map((r) => r.Id),
          [group.Id],
          "siteGroups Title eq",
        );
        const prefix = await drain(SITE_GROUPS, ["Id"], {
          filter: {
            kind: "string",
            column: "Title",
            op: "startsWith",
            value: group.Title.slice(0, 3),
          },
        });
        assertTrue(
          prefix.some((r) => r.Id === group.Id),
          "siteGroups Title startsWith omitted the group",
        );
      },
    },
    {
      name: "where: a column the key cannot carry throws rather than dropping the predicate",
      async run() {
        await assertRejects(
          () => drain(SITE_USERS, ["Id"], eq("Description", "x")),
          "QueryTranslationException",
          "Description on siteUsers",
        );
        await assertRejects(
          () => drain(SITE_GROUPS, ["Id"], eq("Email", "x")),
          "QueryTranslationException",
          "Email on siteGroups",
        );
        await assertRejects(
          () =>
            drain(SITE_USERS, ["Id"], {
              orderBy: [{ column: "Description", direction: "asc" }],
            }),
          undefined,
          "orderBy Description on siteUsers",
        );
        // PrincipalType is DERIVED on two keys — synthesised on siteGroups, computed
        // from ContentTypeId on principals — so it selects fine but nothing behind it
        // can take a filter (siteGroups) or an order key (either).
        await assertRejects(
          () => drain(SITE_GROUPS, ["Id"], eq("PrincipalType", 8)),
          "QueryTranslationException",
          "PrincipalType filter on siteGroups (derived, not a column)",
        );
        await assertRejects(
          () =>
            drain(PRINCIPALS, ["Id"], {
              orderBy: [{ column: "PrincipalType", direction: "asc" }],
            }),
          undefined,
          "orderBy PrincipalType on principals (derived)",
        );
      },
    },
    {
      name: "orderBy Title on the principals source: descending is ascending reversed",
      async run() {
        const asc = await drain(PRINCIPALS, ["Id", "Title"], {
          ...eq("PrincipalType", 1),
          orderBy: [{ column: "Title", direction: "asc" }],
        });
        const desc = await drain(PRINCIPALS, ["Id", "Title"], {
          ...eq("PrincipalType", 1),
          orderBy: [{ column: "Title", direction: "desc" }],
        });
        assertTrue(asc.length > 1, "need at least two users to test ordering");
        // Compare the Title sequences, not the ids: SharePoint breaks Title ties by
        // row id in the SAME direction for both sorts, so two users sharing a display
        // name would make an id comparison a false failure.
        assertEqual(
          desc.map((r) => r.Title),
          [...asc.map((r) => r.Title)].reverse(),
          "desc vs reversed asc (by Title)",
        );
      },
    },
    {
      name: "countAsync on a provider source equals the drained length",
      async run() {
        assertEqual(
          await h.provider.countAsync(SITE_GROUPS),
          (await drain(SITE_GROUPS, ["Id"])).length,
          "siteGroups count",
        );
        const filter = eq("PrincipalType", 1);
        assertEqual(
          await h.provider.countAsync(PRINCIPALS, filter),
          (await drain(PRINCIPALS, ["Id"], filter)).length,
          "principals count with a filter",
        );
      },
    },
    {
      name: "executeReadBatchAsync serves itemsByIds and items on provider sources",
      async run() {
        assertTrue(
          !!h.provider.executeReadBatchAsync,
          "this suite expects executeReadBatchAsync",
        );
        const { user, group } = await h.principals();
        const results = await h.provider.executeReadBatchAsync!([
          {
            kind: "itemsByIds",
            source: PRINCIPALS,
            ids: [user.Id, group.Id],
            fields: PRINCIPAL_FIELDS,
            clientToken: "by-ids",
          },
          {
            kind: "items",
            source: SITE_GROUPS,
            fields: ["Id"],
            pageSize: 100,
            options: eq("Title", group.Title),
            clientToken: "items",
          },
        ]);
        const byIds = results.find((r) => r.clientToken === "by-ids");
        const items = results.find((r) => r.clientToken === "items");
        assertTrue(!!byIds && !!items, "a result is missing its clientToken");
        assertEqual(
          sortedNumbers(byIds.items.map((r) => r.Id)),
          sortedNumbers([user.Id, group.Id]),
          "batched by-ids",
        );
        assertEqual(
          items.items.map((r) => r.Id),
          [group.Id],
          "batched items with a filter",
        );
      },
    },
    {
      name: "an unknown provider key rejects loudly, naming the key",
      async run() {
        const nope: IProviderSource = { kind: "provider", key: "nope" };
        for (const [what, fn] of [
          ["paged", () => h.provider.getItemsPagedAsync(nope, ["Id"], 10)],
          ["by-ids", () => h.provider.getItemsByIdsAsync(nope, [1], ["Id"])],
          ["count", () => h.provider.countAsync(nope)],
        ] as const) {
          const err = await assertRejects(
            fn,
            undefined,
            `${what} on an unknown key`,
          );
          assertTrue(
            err.message.includes("nope"),
            `${what}: error does not name the key: ${err.message}`,
          );
        }
      },
    },
    {
      name: "principals never reports PrincipalType 4: the UIL tells person from group and nothing finer",
      async run() {
        // Live this holds by construction — the derivation from ContentTypeId has only
        // two outcomes — so what the case pins is that a fake or a future implementation
        // does not let a finer type leak through the key.
        const rows = await drain(PRINCIPALS, ["Id", "PrincipalType"]);
        assertTrue(rows.length > 0, "principals returned nothing");
        for (const r of rows) {
          assertTrue(
            r.PrincipalType === 1 || r.PrincipalType === 8,
            `principal ${String(r.Id)} reports PrincipalType ${String(r.PrincipalType)} via the UIL`,
          );
        }
      },
    },
  ];
}
