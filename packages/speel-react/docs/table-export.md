# Table export

## What & when

A table can hand its rows to something other than the screen: a CSV file, a typed Excel
workbook, or a printed report. All three read the same thing — every row the current filters
and search match, not just the rendered page, and only the visible columns, with each cell
as it is displayed. Reach here when users need to take a table's contents elsewhere, or when
an exported value must be a raw number or date rather than formatted text.

## Canonical example

```tsx
import React from "react";
import { SpeelTable, type SpeelTableHandle } from "@speel/react";
import { Request } from "../entities/Request";

function RequestReport({ rows }: { rows: Request[] }) {
  const tableRef = React.useRef<SpeelTableHandle>(null);
  return (
    <SpeelTable
      ref={tableRef}
      of={Request}
      items={rows}
      columns={(r) => [
        r.Title,
        r.Status,
        // Displayed as $1,234.00; exported as a number a spreadsheet can sum.
        { key: "Amount", exportValue: (row) => row.Amount ?? null },
        { key: "DueDate", exportValue: (row) => row.DueDate ?? null },
      ]}
      exportCsv
      exportXlsx={{ fileNamePrefix: "requests", sheetName: "Open requests" }}
      print={{ title: "Request Status Report" }}
      toolbar={<button onClick={() => tableRef.current?.print()}>Print now</button>}
    />
  );
}
```

Each prop adds a toolbar button; the `ref` fires the same action from a control of your own.

## Capabilities

### CSV, Excel, and print

`exportCsv` adds an Export button to the toolbar; `toolbar` puts your own controls beside it.
Both components also expose `exportCsv()` on their `ref`, which works whether or not the prop
was passed. Either way the file covers every matched row, not just the visible page — and only
the visible columns. Each cell exports the text it displays; `exportValue` overrides that, and
is how you emit a raw number or ISO date for a file something else will parse.

`exportXlsx` is the spreadsheet sibling: the same matched rows and visible columns as the
CSV, written as a real `.xlsx` workbook — one sheet, a bold header row, and columns sized to
their content. The difference that matters is that cells are **typed**: a column with an
`exportValue` returning a number arrives as a number Excel can sum, a `Date` as a real date
cell, a boolean as Yes/No, and an empty value as a genuinely blank cell. Columns without an
`exportValue` still export their displayed text, exactly as the CSV does. Name the file and
the sheet with `exportXlsx={{ fileNamePrefix: 'requests', sheetName: 'Open requests' }}`, or
fire it yourself with `ref.current.exportXlsx()`.

`print` is the paper sibling: it adds a Print button that opens a plain black-on-white report
— title, generated-at stamp, and the same matched rows and visible columns the export covers —
and sends it to the browser's print dialog. `print` titles the report after the entity,
`print={{ title: 'Request Status Report' }}` names it yourself, and `ref.current.print()` fires
it from your own control. Cells read exactly as they do in the CSV, `exportValue` included.

### What a cell exports

A cell exports the text its column renders — a masked column exports the mask, a currency
column its formatted amount. `exportValue` on a column replaces that text with a value of your
choosing: a string, number, `Date`, boolean, or empty. In the CSV every value becomes text; in
the workbook the type survives. Print reads cells exactly as the CSV does.

What is exported follows the screen's question, not its layout: the column filters and the
search narrow all three outputs, the pager does not, and a column the user has hidden through
the column chooser is left out of the file and off the paper.

`SpeelTable`'s `ref` exposes `exportCsv()`, `exportXlsx()`, and `print()`. `SpeelEntityTable`'s
handle carries `exportCsv()` and `print()` beside `reload()`; its Excel export is the toolbar
button.

## Boundaries & gotchas

- **Print mirrors the screen too.** The report carries the filtered rows and the visible
  columns — the whole matched set, not the rendered page — so a filter narrows what prints and
  a hidden column stays off the paper. Printing needs a popup window: if the browser blocks it,
  the action is a silent no-op rather than an error.

- **Export mirrors the screen.** A cell's text is read from what the column renders, so a
  masked column exports the masked value and a currency column exports `$1,234.00` rather than
  `1234`. Two consequences: a cell whose text lives inside a custom component
  (`<StatusPill value={x} />`) has no readable text until it renders, so give those columns an
  `exportValue`; and in the CSV, values beginning with `=`, `+`, `-`, or `@` are prefixed with
  an apostrophe, since Excel would otherwise execute them as formulas. The xlsx writer needs
  no such guard — it writes inline strings, which Excel never evaluates — so the apostrophe
  appears in the CSV only.

- **`$1,234.00` is text in a spreadsheet too.** A typed xlsx cell is only as typed as its
  source: without an `exportValue` the writer receives the rendered string, and a column of
  formatted currency lands as text Excel will not sum. If the workbook is meant to be
  calculated on rather than read, give those columns an `exportValue` returning the raw
  number or `Date`.
