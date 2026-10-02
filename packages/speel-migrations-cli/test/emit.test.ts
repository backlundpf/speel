import { describe, it, expect } from "vitest";
import { renderFieldSpec, renderMigrationFile } from "../src/emit.js";
import type { SnapshotDiff } from "../src/diff.js";

describe("renderFieldSpec", () => {
  it("renders a text field builder call", () => {
    expect(
      renderFieldSpec({
        kind: "Text",
        internalName: "Title",
        multiline: false,
        required: true,
        maxLength: 80,
      }),
    ).toBe('(f) => f.text({"required":true,"maxLength":80})');
  });
  it("renders a note (multiline) field", () => {
    expect(
      renderFieldSpec({
        kind: "Text",
        internalName: "Body",
        multiline: true,
        richText: true,
      }),
    ).toBe('(f) => f.note({"richText":true})');
  });
  it("renders choice with the choices array first (opts include fillIn/displayAs)", () => {
    expect(
      renderFieldSpec({
        kind: "Choice",
        internalName: "S",
        multi: false,
        choices: ["a", "b"],
        fillIn: false,
        displayAs: "Dropdown",
      }),
    ).toBe(
      '(f) => f.choice(["a","b"],{"fillIn":false,"displayAs":"Dropdown"})',
    );
  });
  it("renders a lookup", () => {
    expect(
      renderFieldSpec({
        kind: "Lookup",
        internalName: "OwnerId",
        list: "People",
        showField: "Title",
        multi: false,
      }),
    ).toBe(
      '(f) => f.lookup({"list":"People","showField":"Title","multi":false})',
    );
  });
});

describe("renderMigrationFile", () => {
  it("renders a full migration module with up/down", () => {
    const diff: SnapshotDiff = {
      up: [
        {
          op: "createList",
          title: "Projects",
          spec: { title: "Projects", template: "genericList" },
        },
        {
          op: "addField",
          list: "Projects",
          field: {
            kind: "Text",
            internalName: "Title",
            multiline: false,
            required: true,
          },
        },
        { op: "addIndex", list: "Projects", field: "Title" },
      ],
      down: [{ op: "dropList", title: "Projects" }],
    };
    const src = renderMigrationFile("20260605T1200_AddProjects", diff);
    expect(src).toContain(
      "import { defineMigration } from '@speel/migrations';",
    );
    expect(src).toContain(
      "export default defineMigration('20260605T1200_AddProjects', {",
    );
    expect(src).toContain(
      'b.createList("Projects", {"template":"genericList"});',
    );
    expect(src).toContain(
      'b.addField("Projects", "Title", (f) => f.text({"required":true}));',
    );
    expect(src).toContain('b.addIndex("Projects", "Title");');
    expect(src).toContain('b.dropList("Projects");');
    expect(src.trimEnd().endsWith("});")).toBe(true);
  });
});

describe("renderMigrationFile data-loss comments", () => {
  it("prefixes a step that may lose data with a comment", () => {
    const narrow = {
      op: "alterField" as const,
      list: "Config",
      field: {
        kind: "Text" as const,
        internalName: "Value",
        multiline: false,
      },
    };
    const diff: SnapshotDiff = {
      up: [],
      down: [narrow],
      warnings: [
        {
          direction: "down",
          op: narrow,
          message: "truncates to 255 characters.",
        },
      ],
    };
    const src = renderMigrationFile("20260605T1200_Widen", diff);
    expect(src).toContain(
      '    // May lose data: truncates to 255 characters.\n    b.alterField("Config", "Value",',
    );
  });
});
