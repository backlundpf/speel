import * as React from "react";
import {
  SpeelField,
  SpeelModal,
  SpeelPanel,
  SpeelTable,
  useSpeelUI,
  useStandaloneField,
} from "@speel/react";
import type { FieldConfig } from "@speel/core";
import { Programs } from "../../../entities/Programs";

/**
 * A live exhibit of field help text, required currency fields, menu tooltips, surface
 * names and editable tables in a modal — built from standalone fields and in-memory rows,
 * so it needs no list columns of its own. The e2e spec `fixWave.spec.ts` drives it.
 */

const TEXT: FieldConfig = { kind: "Text" } as FieldConfig;
const CURRENCY: FieldConfig = {
  kind: "Currency",
  currencyCode: "USD",
} as FieldConfig;

const HelpTextFields: React.FC = () => {
  const [name, setName] = React.useState("");
  const [amount, setAmount] = React.useState<number | undefined>(undefined);
  const editField = useStandaloneField({
    config: TEXT,
    displayName: "Donor name",
    value: name,
    onChange: setName,
    description: "Last name as printed on the check",
  });
  const viewField = useStandaloneField({
    config: TEXT,
    displayName: "Donor name (view)",
    value: "Contoso",
    onChange: () => {},
    mode: "view",
    description: "Last name as printed on the check",
  });
  const amountField = useStandaloneField({
    config: CURRENCY,
    displayName: "Amount",
    value: amount,
    onChange: setAmount,
    required: true,
  });
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
      <SpeelField field={editField} />
      <SpeelField field={viewField} />
      <SpeelField field={amountField} />
    </div>
  );
};

const rowsOf = (n: number): Programs[] =>
  Array.from({ length: n }, (_, i) =>
    Object.assign(new Programs(), { Id: i + 1, Title: `Program ${i + 1}` }),
  );

const BulkEntryTable: React.FC = () => {
  const [rows] = React.useState(() => rowsOf(60));
  return (
    <SpeelTable
      of={Programs}
      items={rows}
      cellNavigation="tab"
      columns={[
        {
          key: "Title",
          header: "Title",
          render: (r) => (
            <input
              aria-label={`Title for row ${r.Id}`}
              defaultValue={r.Title ?? ""}
            />
          ),
        },
        {
          key: "note",
          header: "Note",
          export: false,
          render: (r) => <input aria-label={`Note for row ${r.Id}`} />,
        },
      ]}
      rowActions={{
        onEdit: () => {},
        onDelete: () => {},
        available: (a, r) => a !== "delete" || (r.Id ?? 0) % 2 === 0,
        ariaLabel: (a, r) => `${a} row ${r.Id}`,
      }}
    />
  );
};

/** A read-only list long enough that the v8 skin virtualizes it (no cellNavigation). */
const LongList: React.FC = () => {
  const [rows] = React.useState(() => rowsOf(150));
  return <SpeelTable of={Programs} items={rows} columns={[{ key: "Title" }]} />;
};

export const FixWaveDemo: React.FC = () => {
  const ui = useSpeelUI();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [longOpen, setLongOpen] = React.useState(false);
  return (
    <section style={{ marginTop: 24 }} aria-label="Fix wave demo">
      <h3>Fix wave demo</h3>
      <HelpTextFields />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <ui.Menu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          trigger={
            <ui.Button text="More actions" onClick={() => setMenuOpen(true)} />
          }
          sections={[
            {
              key: "s",
              items: [
                {
                  key: "resend",
                  text: "Resend notifications",
                  tooltip: "Nothing to resend until the stage starts",
                  disabled: true,
                  onClick: () => {},
                },
                { key: "export", text: "Export", onClick: () => {} },
              ],
            },
          ]}
        />
        <ui.Button text="Open bulk entry" onClick={() => setModalOpen(true)} />
        <ui.Button text="Open demo panel" onClick={() => setPanelOpen(true)} />
        <ui.Button text="Open long list" onClick={() => setLongOpen(true)} />
      </div>
      <SpeelModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Bulk entry"
      >
        <BulkEntryTable />
      </SpeelModal>
      <SpeelModal open={longOpen} onOpenChange={setLongOpen} title="Long list">
        <LongList />
      </SpeelModal>
      <SpeelPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        ariaLabel="Demo panel"
      >
        <p>An untitled panel, named for screen readers.</p>
      </SpeelPanel>
    </section>
  );
};
