import { describe, it, expect, vi } from "vitest";
import { SharePointSchemaProvider } from "../src/schema/SharePointSchemaProvider.js";
import { emptySnapshot } from "@speel/migrations";
import type { SchemaOperation, SchemaSnapshot } from "@speel/migrations";

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
  // The current SchemaXml per internal name — what a retype reads back.
  const schemaXml: Record<string, string> = {
    Value:
      '<Field Type="Text" DisplayName="Value" Required="FALSE" Indexed="FALSE" MaxLength="255" ID="{value-id}" SourceID="{tasks-guid}" StaticName="Value" Name="Value" ColName="nvarchar5" />',
  };
  const state = { executed: false };
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
      select:
        (...cols: string[]) =>
        async () => {
          calls.push(
            `selectField:${n}:${cols.join(",")}:${state.executed ? "after" : "before"} execute`,
          );
          const xml = schemaXml[n];
          if (xml === undefined) throw new Error(`404 field ${n}`);
          return { SchemaXml: xml };
        },
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
      return [
        sp,
        vi.fn(async () => {
          state.executed = true;
        }),
      ];
    },
  };
  return { sp, calls, batchProps, fieldXmlArgs, schemaXml };
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
    // 8 (AddFieldInternalNameHint) | 16 (AddFieldToDefaultView)
    expect(arg.Options).toBe(24);
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

describe("SharePointSchemaProvider addField default view", () => {
  async function optionsFor(op: SchemaOperation) {
    const { sp, fieldXmlArgs } = makeFakeSp();
    await new SharePointSchemaProvider(sp as never).applyAsync(
      [op],
      emptySnapshot(),
    );
    return fieldXmlArgs[0] as { SchemaXml: string; Options: number };
  }

  it("adds a new column to the default view", async () => {
    const arg = await optionsFor({
      op: "addField",
      list: "Tasks",
      field: { kind: "Boolean", internalName: "Done" },
    });
    expect(arg.Options & 16).toBe(16);
    expect(arg.Options & 8).toBe(8);
  });

  it("leaves it out when the field opts out", async () => {
    const arg = await optionsFor({
      op: "addField",
      list: "Tasks",
      field: { kind: "Boolean", internalName: "Done", addToDefaultView: false },
    });
    expect(arg.Options).toBe(8);
  });

  it("leaves a hidden field out without being told", async () => {
    const arg = await optionsFor({
      op: "addField",
      list: "Tasks",
      field: { kind: "Boolean", internalName: "Sync", hidden: true },
    });
    expect(arg.Options).toBe(8);
    expect(arg.SchemaXml).toContain('Hidden="TRUE"');
  });
});

describe("SharePointSchemaProvider alterField type changes", () => {
  function snapWith(type: string): SchemaSnapshot {
    const snap = emptySnapshot();
    snap.lists.set("Tasks", {
      id: "tasks-guid",
      title: "Tasks",
      fields: new Map([
        [
          "Value",
          {
            internalName: "Value",
            typeAsString: type,
            required: false,
            indexed: false,
          },
        ],
      ]),
    });
    return snap;
  }
  const note: SchemaOperation = {
    op: "alterField",
    list: "Tasks",
    field: {
      kind: "Text",
      internalName: "Value",
      displayName: "Value",
      multiline: true,
      richText: false,
      appendOnly: false,
      numberOfLines: 6,
    },
  };
  const text: SchemaOperation = {
    op: "alterField",
    list: "Tasks",
    field: {
      kind: "Text",
      internalName: "Value",
      displayName: "Value",
      multiline: false,
      maxLength: 255,
    },
  };

  it("keeps the MERGE update when the type does not change", async () => {
    const { sp, calls } = makeFakeSp();
    await new SharePointSchemaProvider(sp as never).applyAsync(
      [text],
      snapWith("Text"),
    );
    expect(calls).toEqual([
      'updateField:Value:{"Required":false,"Title":"Value","MaxLength":255}',
    ]);
  });

  it("rewrites the SchemaXml for Text → Note, after the batch, keeping the column's ID", async () => {
    const { sp, calls } = makeFakeSp();
    const [result] = await new SharePointSchemaProvider(sp as never).applyAsync(
      [note],
      snapWith("Text"),
    );

    expect(result).toEqual({ op: note, status: "applied" });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/^selectField:Value:SchemaXml:/);
    const update = JSON.parse(
      calls[1]!.slice("updateField:Value:".length),
    ) as Record<string, string>;
    expect(Object.keys(update)).toEqual(["SchemaXml"]);
    expect(update.SchemaXml).toContain('Type="Note"');
    expect(update.SchemaXml).toContain('ID="{value-id}"');
    expect(update.SchemaXml).toContain('SourceID="{tasks-guid}"');
    expect(update.SchemaXml).toContain('NumLines="6"');
    expect(update.SchemaXml).not.toContain("MaxLength");
  });

  it("rewrites the SchemaXml for Note → Text too (the rollback)", async () => {
    const { sp, calls, schemaXml } = makeFakeSp();
    schemaXml.Value =
      '<Field Type="Note" DisplayName="Value" NumLines="6" RichText="FALSE" ID="{value-id}" SourceID="{tasks-guid}" StaticName="Value" Name="Value" />';
    const [result] = await new SharePointSchemaProvider(sp as never).applyAsync(
      [text],
      snapWith("Note"),
    );

    expect(result?.status).toBe("applied");
    const update = JSON.parse(
      calls[1]!.slice("updateField:Value:".length),
    ) as Record<string, string>;
    expect(update.SchemaXml).toContain('Type="Text"');
    expect(update.SchemaXml).toContain('MaxLength="255"');
    expect(update.SchemaXml).not.toMatch(/NumLines|RichText/);
  });

  it("falls back to the MERGE update for a column the snapshot does not hold", async () => {
    const { sp, calls } = makeFakeSp();
    await new SharePointSchemaProvider(sp as never).applyAsync(
      [note],
      emptySnapshot(),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^updateField:Value:.*"RichText":false/);
  });

  it("keeps op order in the results and isolates a failed retype", async () => {
    const { sp, calls, schemaXml } = makeFakeSp();
    delete schemaXml.Value;
    const drop: SchemaOperation = { op: "dropList", title: "Other" };
    const results = await new SharePointSchemaProvider(sp as never).applyAsync(
      [note, drop],
      snapWith("Text"),
    );

    expect(results.map((r) => r.op)).toEqual([note, drop]);
    expect(results[0]?.status).toBe("failed");
    expect(results[0]?.error?.message).toMatch(/404 field Value/);
    expect(results[1]?.status).toBe("applied");
    expect(calls).toContain("recycleList:Other");
    // The retype read never rides the batch: it goes once the batch is sent.
    expect(calls).toContain("selectField:Value:SchemaXml:after execute");
  });
});
