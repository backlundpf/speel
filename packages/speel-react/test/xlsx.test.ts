import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import {
  buildXlsx,
  columnRef,
  excelSerial,
  sheetNameFor,
  xlsxFileName,
} from "../src/table/xlsx.js";
import { cellValue } from "../src/table/cellText.js";
import type { ResolvedColumn } from "../src/table/columns.js";

interface Row {
  Id: number;
  Title: string;
  Due: Date | null;
  Done: boolean;
}
const rows: Row[] = [
  { Id: 1, Title: "A & <B>", Due: new Date(2026, 8, 15), Done: true },
  { Id: 2, Title: "=SUM(1)", Due: null, Done: false },
];

function col(
  key: keyof Row,
  header: string,
  exportValue?: (r: Row) => string | number | Date | boolean | null,
): ResolvedColumn<Row> {
  return {
    key,
    header,
    render: (r) => String(r[key] ?? ""),
    sortable: false,
    ...(exportValue ? { exportValue } : {}),
  };
}
const columns: ResolvedColumn<Row>[] = [
  col("Id", "Id", (r) => r.Id),
  col("Title", "Title"),
  col("Due", "Due", (r) => r.Due),
  col("Done", "Done", (r) => r.Done),
];

const sheetOf = (bytes: Uint8Array): string =>
  strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]!);

describe("cellValue", () => {
  it("keeps a typed exportValue as-is and reads null as an empty string", () => {
    expect(cellValue(columns[0]!, rows[0]!)).toBe(1);
    expect(cellValue(columns[2]!, rows[0]!)).toEqual(new Date(2026, 8, 15));
    expect(cellValue(columns[2]!, rows[1]!)).toBe("");
    expect(cellValue(columns[3]!, rows[0]!)).toBe(true);
  });
  it("falls back to the rendered text when there is no exportValue", () => {
    expect(cellValue(columns[1]!, rows[0]!)).toBe("A & <B>");
  });
});

describe("buildXlsx", () => {
  it("is a workbook with the parts Excel needs, named after the sheet", () => {
    const files = unzipSync(buildXlsx(columns, rows, "Tasks"));
    expect(Object.keys(files).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    expect(strFromU8(files["xl/workbook.xml"]!)).toContain(
      '<sheet name="Tasks"',
    );
  });

  it("writes a bold header row", () => {
    const xml = sheetOf(buildXlsx(columns, rows, "Tasks"));
    expect(xml).toContain(
      '<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Id</t></is></c>',
    );
    expect(xml).toContain(
      '<c r="B1" s="1" t="inlineStr"><is><t xml:space="preserve">Title</t></is></c>',
    );
  });

  it("keeps numbers numeric, dates as dated serials, booleans as Yes/No, strings escaped", () => {
    const xml = sheetOf(buildXlsx(columns, rows, "Tasks"));
    expect(xml).toContain('<c r="A2"><v>1</v></c>');
    expect(xml).toContain(
      `<c r="C2" s="2"><v>${excelSerial(new Date(2026, 8, 15))}</v></c>`,
    );
    expect(xml).toContain('<t xml:space="preserve">A &amp; &lt;B&gt;</t>');
    expect(xml).toContain(
      '<c r="D2" t="inlineStr"><is><t xml:space="preserve">Yes</t></is></c>',
    );
    expect(xml).toContain(
      '<c r="D3" t="inlineStr"><is><t xml:space="preserve">No</t></is></c>',
    );
    // An inline string is never evaluated, so the CSV formula guard has no counterpart here.
    expect(xml).toContain('<t xml:space="preserve">=SUM(1)</t>');
    // An empty cell is omitted rather than written empty.
    expect(xml).not.toContain('r="C3"');
  });

  it("sizes columns from the longest text, within bounds", () => {
    const xml = sheetOf(buildXlsx(columns, rows, "Tasks"));
    // "A & <B>" is 7 characters + 2 padding = 9 → wins over the 5-character header.
    expect(xml).toContain('<col min="2" max="2" width="9" customWidth="1"/>');
    // "Id" is 2 characters; the floor is 8.
    expect(xml).toContain('<col min="1" max="1" width="8" customWidth="1"/>');
  });

  it("returns an empty sheet body for no rows", () => {
    const xml = sheetOf(buildXlsx(columns, [], "Tasks"));
    expect(xml).toContain('<row r="1">');
    expect(xml).not.toContain('<row r="2">');
  });

  it("strips the control characters XML 1.0 forbids but keeps a tab", () => {
    const bell = String.fromCharCode(7);
    const unitSeparator = String.fromCharCode(31);
    const tab = String.fromCharCode(9);
    const xml = sheetOf(
      buildXlsx(
        columns,
        [
          {
            Id: 1,
            Title: "a" + bell + "b" + unitSeparator + "c",
            Due: null,
            Done: false,
          },
          { Id: 2, Title: "x" + tab + "y", Due: null, Done: false },
        ],
        "Tasks",
      ),
    );
    expect(xml).toContain('<t xml:space="preserve">abc</t>');
    expect(xml).toContain(`<t xml:space="preserve">x${tab}y</t>`);
  });

  it("omits <cols> when there are no columns, keeping the sheet data", () => {
    const xml = sheetOf(buildXlsx([], rows, "Tasks"));
    expect(xml).not.toContain("<cols>");
    expect(xml).toContain("<sheetData>");
  });
});

describe("excelSerial", () => {
  it("counts whole days since 1899-12-30, local calendar date only", () => {
    expect(excelSerial(new Date(1899, 11, 31))).toBe(1);
    expect(excelSerial(new Date(2024, 0, 1))).toBe(45292);
    expect(excelSerial(new Date(2026, 8, 15, 23, 59))).toBe(46280);
  });
});

describe("columnRef", () => {
  it("letters columns, including past Z", () => {
    expect(columnRef(0)).toBe("A");
    expect(columnRef(25)).toBe("Z");
    expect(columnRef(26)).toBe("AA");
    expect(columnRef(27)).toBe("AB");
    expect(columnRef(701)).toBe("ZZ");
    expect(columnRef(702)).toBe("AAA");
  });
});

describe("sheetNameFor", () => {
  it("drops the characters Excel forbids, collapses the gaps, and caps at 31", () => {
    expect(sheetNameFor("Audit: Requests [FY26]")).toBe("Audit Requests FY26");
    expect(sheetNameFor("a/b\\c?d*e")).toBe("a b c d e");
    expect(sheetNameFor("x".repeat(40))).toHaveLength(31);
  });
  it("never yields an empty name", () => {
    expect(sheetNameFor("")).toBe("Sheet1");
    expect(sheetNameFor("???")).toBe("Sheet1");
  });
});

describe("xlsxFileName", () => {
  it("dates the file like the CSV export does", () => {
    expect(xlsxFileName("Report", new Date(2026, 8, 15))).toBe(
      "Report-2026-09-15.xlsx",
    );
  });
});
