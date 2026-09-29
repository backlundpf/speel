import { describe, it, expect, vi } from "vitest";
import { SharePointSchemaProvider } from "../src/schema/SharePointSchemaProvider.js";
import { emptySnapshot } from "@speel/migrations";
import type { SchemaOperation } from "@speel/migrations";

// Structural SPFI double. `batched()` hands back the same surface plus an
// execute(), so we can assert both what was queued and how many batch scopes
// were opened per applyAsync call.
function makeFakeSp() {
  const calls: string[] = [];
  const batchProps: unknown[] = [];
  const listRows = [
    {
      Id: "tasks-guid",
      Title: "Tasks",
      Fields: [
        {
          InternalName: "Title",
          TypeAsString: "Text",
          Required: true,
          Indexed: false,
        },
        {
          InternalName: "Due",
          TypeAsString: "DateTime",
          Required: false,
          Indexed: true,
        },
      ],
    },
    { Id: "empty-guid", Title: "NoFields" },
  ];

  const fieldXmlArgs: unknown[] = [];
  const fields = {
    createFieldAsXml: vi.fn(
      async (xml: string | { SchemaXml: string; Options?: number }) => {
        fieldXmlArgs.push(xml);
        calls.push(
          `createFieldAsXml:${typeof xml === "string" ? xml : xml.SchemaXml}`,
        );
      },
    ),
    getByInternalNameOrTitle: (n: string) => ({
      update: vi.fn(async (props: unknown) => {
        calls.push(`updateField:${n}:${JSON.stringify(props)}`);
      }),
      delete: vi.fn(async () => {
        calls.push(`deleteField:${n}`);
      }),
    }),
  };
  const list = (title: string) => ({
    fields,
    update: vi.fn(async (props: unknown) => {
      calls.push(`updateList:${title}:${JSON.stringify(props)}`);
    }),
    recycle: vi.fn(async () => {
      calls.push(`recycleList:${title}`);
    }),
  });
  const lists = {
    getByTitle: (t: string) => list(t),
    add: vi.fn(async (title: string) => {
      calls.push(`addList:${title}`);
      return { Id: `new-${title}` };
    }),
    select: () => lists,
    expand: () => lists,
    filter: (f: string) => {
      calls.push(`filter:${f}`);
      return async () => listRows;
    },
  };
  const sp = {
    web: { lists },
    batched: (props: unknown) => {
      batchProps.push(props);
      return [sp, vi.fn(async () => {})];
    },
  };
  return { sp, calls, batchProps, fieldXmlArgs };
}

describe("SharePointSchemaProvider.readSchemaAsync", () => {
  it("reads lists and fields in one request", async () => {
    const { sp, calls } = makeFakeSp();
    const snap = await new SharePointSchemaProvider(
      sp as never,
    ).readSchemaAsync();

    expect(calls).toEqual(["filter:Hidden eq false"]);
    expect(snap.lists.get("Tasks")?.id).toBe("tasks-guid");
    expect(snap.lists.get("Tasks")?.fields.get("Due")).toEqual({
      internalName: "Due",
      typeAsString: "DateTime",
      required: false,
      indexed: true,
    });
  });

  it("tolerates a list that came back without a Fields array", async () => {
    const { sp } = makeFakeSp();
    const snap = await new SharePointSchemaProvider(
      sp as never,
    ).readSchemaAsync();
    expect(snap.lists.get("NoFields")?.fields.size).toBe(0);
  });
});

describe("SharePointSchemaProvider.applyAsync", () => {
  it("opens one batch scope at the 100-request cap", async () => {
    const { sp, batchProps } = makeFakeSp();
    await new SharePointSchemaProvider(sp as never).applyAsync(
      [{ op: "dropList", title: "Tasks" }],
      emptySnapshot(),
    );
    expect(batchProps).toEqual([{ maxRequests: 100 }]);
  });

  it("makes no request at all for an empty op list", async () => {
    const { sp, batchProps, calls } = makeFakeSp();
    const results = await new SharePointSchemaProvider(sp as never).applyAsync(
      [],
      emptySnapshot(),
    );
    expect(results).toEqual([]);
    expect(batchProps).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("creates a field from CAML, not from add* plus update", async () => {
    const { sp, calls } = makeFakeSp();
    const op: SchemaOperation = {
      op: "addField",
      list: "Tasks",
      field: { kind: "Boolean", internalName: "Done", required: true },
    };
    await new SharePointSchemaProvider(sp as never).applyAsync(
      [op],
      emptySnapshot(),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('Type="Boolean"');
    expect(calls[0]).toContain('Required="TRUE"');
  });

  it("sends AddFieldInternalNameHint so Name wins over DisplayName", async () => {
    // Without Options=8 SharePoint derives the internal name from DisplayName,
    // so "Action Items" lands as Action_x0020_Items and every later presence
    // check — which looks up the internal name — reports the column missing.
    const { sp, fieldXmlArgs } = makeFakeSp();
    const op: SchemaOperation = {
      op: "addField",
      list: "Tasks",
      field: {
        kind: "Boolean",
        internalName: "ActionItems",
        displayName: "Action Items",
      },
    };
    await new SharePointSchemaProvider(sp as never).applyAsync(
      [op],
      emptySnapshot(),
    );

    expect(fieldXmlArgs).toHaveLength(1);
    const arg = fieldXmlArgs[0] as { SchemaXml: string; Options?: number };
    expect(typeof arg).toBe("object");
    expect(arg.Options).toBe(8);
    expect(arg.SchemaXml).toContain('Name="ActionItems"');
    expect(arg.SchemaXml).toContain('DisplayName="Action Items"');
  });

  it("returns the created list id so later waves can resolve lookups", async () => {
    const { sp } = makeFakeSp();
    const op: SchemaOperation = {
      op: "createList",
      title: "Alpha",
      spec: { title: "Alpha", template: "genericList" },
    };
    const [result] = await new SharePointSchemaProvider(sp as never).applyAsync(
      [op],
      emptySnapshot(),
    );
    expect(result).toEqual({ op, status: "applied", listId: "new-Alpha" });
  });

  it("reports a failing op without failing its neighbours", async () => {
    const { sp, calls } = makeFakeSp();
    const bad: SchemaOperation = {
      op: "addField",
      list: "Tasks",
      field: {
        kind: "Lookup",
        internalName: "Owner",
        list: "Ghost",
        showField: "Title",
        multi: false,
      },
    };
    const good: SchemaOperation = { op: "dropList", title: "Tasks" };

    const results = await new SharePointSchemaProvider(sp as never).applyAsync(
      [bad, good],
      emptySnapshot(),
    );

    expect(results[0]?.status).toBe("failed");
    expect(results[0]?.error?.message).toMatch(/lookup target 'Ghost'/);
    expect(results[1]?.status).toBe("applied");
    expect(calls).toContain("recycleList:Tasks");
  });

  it("turns a rejected sub-request into a failed result", async () => {
    const { sp } = makeFakeSp();
    sp.web.lists.add.mockImplementation(async () => {
      throw new Error("403 denied");
    });
    const op: SchemaOperation = {
      op: "createList",
      title: "Alpha",
      spec: { title: "Alpha", template: "genericList" },
    };
    const [result] = await new SharePointSchemaProvider(sp as never).applyAsync(
      [op],
      emptySnapshot(),
    );
    expect(result?.status).toBe("failed");
    expect(result?.error?.message).toBe("403 denied");
  });

  it("routes each op kind to its endpoint", async () => {
    const { sp, calls } = makeFakeSp();
    await new SharePointSchemaProvider(sp as never).applyAsync(
      [
        { op: "renameList", from: "Tasks", to: "Work" },
        { op: "renameField", list: "Tasks", from: "Due", to: "Deadline" },
        { op: "dropField", list: "Tasks", name: "Old" },
        { op: "addIndex", list: "Tasks", field: "Due" },
        { op: "dropIndex", list: "Tasks", field: "Due" },
      ],
      emptySnapshot(),
    );

    expect(calls).toEqual([
      'updateList:Tasks:{"Title":"Work"}',
      'updateField:Due:{"Title":"Deadline"}',
      "deleteField:Old",
      'updateField:Due:{"Indexed":true}',
      'updateField:Due:{"Indexed":false}',
    ]);
  });

  it("recycles rather than hard-deletes a dropped list", async () => {
    const { sp, calls } = makeFakeSp();
    await new SharePointSchemaProvider(sp as never).applyAsync(
      [{ op: "dropList", title: "Tasks" }],
      emptySnapshot(),
    );
    expect(calls).toEqual(["recycleList:Tasks"]);
  });
});
