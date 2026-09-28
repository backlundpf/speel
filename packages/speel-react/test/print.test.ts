import { describe, it, expect } from "vitest";
import { buildPrintHtml } from "../src/table/print.js";
import type { ResolvedColumn } from "../src/table/columns.js";

interface Row {
  a?: string;
  b?: string;
}

// Same stub shape the csv tests use — the exporter only reads key/header/render/exportValue.
function col(over: Partial<ResolvedColumn<Row>>): ResolvedColumn<Row> {
  return {
    key: "a",
    header: "A",
    render: (r) => r.a,
    sortable: false,
    ...over,
  };
}

describe("buildPrintHtml", () => {
  const when = new Date(2026, 7, 13, 12, 0, 0);

  it("renders title, timestamp, headers, and one row per item", () => {
    const html = buildPrintHtml(
      "Request Status Report",
      [
        col({ key: "a", header: "Alpha", render: (r) => r.a }),
        col({ key: "b", header: "Beta", render: (r) => r.b }),
      ],
      [
        { a: "1", b: "2" },
        { a: "3", b: "4" },
      ],
      when,
    );
    expect(html).toContain("<title>Request Status Report</title>");
    expect(html).toContain("<h1>Request Status Report</h1>");
    expect(html).toContain(when.toLocaleString());
    expect(html).toContain(">Alpha<");
    expect(html).toContain(">Beta<");
    expect((html.match(/<tr>/g) ?? []).length).toBe(3); // 1 header + 2 body
    expect(html).toContain("<td>1</td>");
    expect(html).toContain("<td>4</td>");
  });

  it("respects exportValue overrides via cellText", () => {
    const html = buildPrintHtml(
      "T",
      [col({ exportValue: (r) => `masked-${r.a}` })],
      [{ a: "raw" }],
      when,
    );
    expect(html).toContain("masked-raw");
    expect(html).not.toContain(">raw<");
  });

  it("HTML-escapes cell text and the title", () => {
    const html = buildPrintHtml(
      "<script>x</script>",
      [col({})],
      [{ a: '<b>&"bold"</b>' }],
      when,
    );
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;&amp;");
  });

  it("renders an empty tbody when there are no rows", () => {
    const html = buildPrintHtml("T", [col({})], [], when);
    expect(html).toContain("<tbody></tbody>");
    expect((html.match(/<tr>/g) ?? []).length).toBe(1);
  });
});
