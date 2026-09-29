import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { DbContext, ModelBuilder, type IBatchOperation } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useEntityForm,
  EntityFormProvider,
} from "../src/form/useEntityForm.js";
import { useField } from "../src/form/useField.js";
import { SpeelField } from "../src/fields/SpeelField.js";
import { createsByForm } from "../src/fields/createsByForm.js";
import type { FieldHandle } from "../src/form/FieldHandle.js";
import type {
  FormRequest,
  SurfaceApi,
  SurfaceResult,
} from "../src/surface/SurfaceManager.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Office {
  Id?: number;
  Title?: string;
  Category?: string;
}
class Person {
  Id?: number;
  Title?: string;
  Department?: string;
  Office?: Office | null;
  OfficeId?: number;
}

/** A fake SurfaceApi whose `showForm` is a spy the test drives directly — no DOM. */
function fakeSurfaces(
  impl: (req: FormRequest) => Promise<SurfaceResult>,
): SurfaceApi & { showForm: ReturnType<typeof vi.fn> } {
  const showForm = vi.fn(impl);
  return {
    showForm,
    showDocumentForm: vi.fn(),
  } as unknown as SurfaceApi & { showForm: ReturnType<typeof vi.fn> };
}

/** A bare DbContext over Offices (+ People, for the parent-pending-change test). */
function makeDb(
  officeRows: { ID: number; Title: string; Category?: string }[] = [],
  batchOps?: IBatchOperation[],
) {
  const provider = makeFakeProvider(
    { Offices: officeRows, People: [] },
    { applyFilter: true, ...(batchOps ? { batchOps } : {}) },
  );
  class Ctx extends DbContext {
    protected override onModelCreating(mb: ModelBuilder): void {
      mb.entity(Office, (b) => {
        b.toList("Offices");
        b.property((e) => e.Id).isNumber();
        b.property((e) => e.Title).isText();
        b.property((e) => e.Category).isText();
      });
      mb.entity(Person, (b) => {
        b.toList("People");
        b.property((e) => e.Id).isNumber();
        b.property((e) => e.Title).isText();
        b.property((e) => e.Department).isText();
      });
    }
  }
  return new Ctx({ provider } as never);
}

describe("createsByForm — the creator directly", () => {
  it("returns an exact match and never opens a form", async () => {
    const db = makeDb([{ ID: 1, Title: "London" }]);
    const set = db.set(Office);
    const surfaces = fakeSurfaces(async () => {
      throw new Error("must not be called");
    });
    const creator = createsByForm<Person, Office>();

    const result = await creator({
      text: "London",
      set,
      db,
      source: {} as Person,
      displayField: "Title",
      surfaces,
    });

    expect((result as Office | undefined)?.Title).toBe("London");
    expect(surfaces.showForm).not.toHaveBeenCalled();
  });

  it("opens a create form seeded with initial, the typed text winning over it", async () => {
    const db = makeDb([]);
    const set = db.set(Office);
    const surfaces = fakeSurfaces(async (req) => ({
      action: "cancel",
      entity: req.entity,
    }));
    const creator = createsByForm<Person, Office>({
      fields: ["Title", "Category"],
      // initial also names the display field — the typed text must win over it.
      initial: ({ source }) => ({
        Title: "Should not survive",
        Category: (source as unknown as Person).Department!,
      }),
    });

    await creator({
      text: "Zurich",
      set,
      db,
      source: { Department: "Ops" } as unknown as Person,
      displayField: "Title",
      surfaces,
    });

    expect(surfaces.showForm).toHaveBeenCalledTimes(1);
    const req = surfaces.showForm.mock.calls[0]![0] as FormRequest<Office>;
    expect((req.entity as Office).Title).toBe("Zurich");
    expect((req.entity as Office).Category).toBe("Ops");
    expect(req.mode).toBe("create");
    expect(req.surface).toBe("modal");
    expect(req.title).toBe("New Offices");
    expect(req.fields).toEqual(["Title", "Category"]);
  });

  it("titles the form from the target list, not the class name a minifier may mangle", async () => {
    class Mangled {
      Id?: number;
      Title?: string;
    }
    const provider = makeFakeProvider({ "Job Titles": [] });
    class Ctx extends DbContext {
      protected override onModelCreating(mb: ModelBuilder): void {
        mb.entity(Mangled, (b) => {
          b.toList("Job Titles");
          b.property((e) => e.Id).isNumber();
          b.property((e) => e.Title).isText();
        });
      }
    }
    const db = new Ctx({ provider } as never);
    const surfaces = fakeSurfaces(async (req) => ({
      action: "cancel",
      entity: req.entity,
    }));

    await createsByForm<unknown, Mangled>()({
      text: "Engineer",
      set: db.set(Mangled),
      db,
      source: {},
      displayField: "Title",
      surfaces,
    });

    const req = surfaces.showForm.mock.calls[0]![0] as FormRequest<Mangled>;
    expect(req.title).toBe("New Job Titles");
  });

  it("uses the title it is given over the derived one", async () => {
    const db = makeDb([]);
    const surfaces = fakeSurfaces(async (req) => ({
      action: "cancel",
      entity: req.entity,
    }));

    await createsByForm<Person, Office>({ title: "Add an office" })({
      text: "Zurich",
      set: db.set(Office),
      db,
      source: {} as Person,
      displayField: "Title",
      surfaces,
    });

    const req = surfaces.showForm.mock.calls[0]![0] as FormRequest<Office>;
    expect(req.title).toBe("Add an office");
  });

  it("falls back to the class name when the target list is addressed by id", async () => {
    class Region {
      Id?: number;
      Title?: string;
    }
    const provider = makeFakeProvider({ "8f1c-regions": [] });
    class Ctx extends DbContext {
      protected override onModelCreating(mb: ModelBuilder): void {
        mb.entity(Region, (b) => {
          b.toList({ id: "8f1c-regions" });
          b.property((e) => e.Id).isNumber();
          b.property((e) => e.Title).isText();
        });
      }
    }
    const db = new Ctx({ provider } as never);
    const surfaces = fakeSurfaces(async (req) => ({
      action: "cancel",
      entity: req.entity,
    }));

    await createsByForm<unknown, Region>()({
      text: "North",
      set: db.set(Region),
      db,
      source: {},
      displayField: "Title",
      surfaces,
    });

    const req = surfaces.showForm.mock.calls[0]![0] as FormRequest<Region>;
    expect(req.title).toBe("New Region");
  });

  it("submits by saving through a scope, leaving the parent's pending changes unwritten", async () => {
    const batchOps: IBatchOperation[] = [];
    const db = makeDb([], batchOps);
    const set = db.set(Office);
    // A parent-tracked pending change that the child's scoped save must not flush.
    db.set(Person).add(
      Object.assign(new Person(), { Title: "Pending Person" }),
    );

    const surfaces = fakeSurfaces(async (req) => {
      await req.onSubmit?.(req.entity, {
        mode: "create",
        signal: new AbortController().signal,
        addOptions: {},
      });
      return { action: "submit", entity: req.entity };
    });
    const creator = createsByForm<Person, Office>();

    const result = await creator({
      text: "Zurich",
      set,
      db,
      source: {} as Person,
      displayField: "Title",
      surfaces,
    });

    expect((result as Office | undefined)?.Title).toBe("Zurich");
    // Only the created row was flushed — the parent's own pending Person add rode
    // along with nothing, proving the save went through an isolated scope, not the
    // parent's own tracker.
    expect(batchOps).toHaveLength(1);
    expect(batchOps[0]).toMatchObject({ kind: "insert" });

    // The parent's pending change is still there, unflushed, until its own save runs.
    await db.saveChangesAsync();
    expect(batchOps).toHaveLength(2);
  });

  it("cancel resolves undefined", async () => {
    const db = makeDb([]);
    const set = db.set(Office);
    const surfaces = fakeSurfaces(async (req) => ({
      action: "cancel",
      entity: req.entity,
    }));
    const creator = createsByForm<Person, Office>();

    const result = await creator({
      text: "Zurich",
      set,
      db,
      source: {} as Person,
      displayField: "Title",
      surfaces,
    });

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// End to end, through the real SpeelField + SelectionFieldBody + SurfaceManager,
// with the fake adapter rendering the create form's Dialog.
// ---------------------------------------------------------------------------

interface Mounted {
  field: { readonly value: unknown };
  db: DbContext;
}

async function renderPersonOfficeField(opts: {
  creator: ReturnType<typeof createsByForm<Person, Office>>;
  officeRows?: { ID: number; Title: string; Category?: string }[];
  value?: { Id: number; Title: string };
  /** Every batch the provider is asked to run rejects with this message. */
  rejectBatch?: string;
}): Promise<Mounted> {
  const provider = makeFakeProvider(
    { Offices: opts.officeRows ?? [], People: [] },
    { applyFilter: true },
  );
  if (opts.rejectBatch !== undefined) {
    const message = opts.rejectBatch;
    provider.executeBatchAsync = async () => {
      throw new Error(message);
    };
  }
  class Ctx extends DbContext {
    protected override onModelCreating(mb: ModelBuilder): void {
      mb.entity(Office, (b) => {
        b.toList("Offices");
        b.property((e) => e.Id).isNumber();
        b.property((e) => e.Title).isText();
        b.property((e) => e.Category).isText();
      });
      mb.entity(Person, (b) => {
        b.toList("People");
        b.property((e) => e.Id).isNumber();
        b.property((e) => e.Title).isText();
        b.property((e) => e.Department).isText();
        b.hasOne(Office, (e) => e.Office)
          .withMany()
          .hasForeignKey((e) => e.OfficeId)
          .hasDisplayField((o) => o.Title)
          .hasOptionsCreateAsync(opts.creator);
      });
    }
  }
  const db = new Ctx({ provider } as never);
  const person = Object.assign(new Person(), {
    Id: 7,
    Title: "Ada",
    Department: "Ops",
  });
  if (opts.value) {
    person.Office = Object.assign(new Office(), opts.value);
    person.OfficeId = opts.value.Id;
  }

  let captured: FieldHandle | undefined;
  function Probe() {
    captured = useField("Office");
    return null;
  }
  function Inner() {
    const form = useEntityForm(person as never, "edit");
    return (
      <EntityFormProvider value={form as never}>
        <Probe />
        <SpeelField name="Office" />
      </EntityFormProvider>
    );
  }
  render(
    <SpeelProvider db={db as never} ui={fakeAdapter}>
      <Inner />
    </SpeelProvider>,
  );
  await screen.findByLabelText("Office");
  return {
    field: {
      get value() {
        return captured?.value;
      },
    },
    db,
  };
}

async function type(label: string, text: string): Promise<void> {
  const input = screen.getByLabelText(label);
  fireEvent.focus(input);
  await act(async () => {
    fireEvent.change(input, { target: { value: text } });
  });
}

describe("createsByForm — end to end through SpeelField", () => {
  it("opens a modal seeded with the typed text and initial, and saves the new row", async () => {
    const creator = createsByForm<Person, Office>({
      fields: ["Title", "Category"],
      initial: ({ source }) => ({
        Category: (source as unknown as Person).Department!,
      }),
    });
    const m = await renderPersonOfficeField({ creator });

    await type("Office", "Zurich");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    );

    const dialog = await screen.findByRole("dialog", { name: "New Offices" });
    expect(within(dialog).getByLabelText("Title")).toHaveValue("Zurich");
    expect(within(dialog).getByLabelText("Category")).toHaveValue("Ops");

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect((m.field.value as Office | null)?.Title).toBe("Zurich"),
    );
    expect((m.field.value as Office).Id).toBeDefined();
  });

  it("a failed save stays in the create form: the dialog stays open and the Add row stays adding", async () => {
    const creator = createsByForm<Person, Office>();
    const m = await renderPersonOfficeField({
      creator,
      rejectBatch: "The server refused the insert.",
    });

    await type("Office", "Zurich");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New Offices" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    // The save error is shown by the create form's own error chrome…
    expect(
      await within(dialog).findByText(/The server refused the insert\./),
    ).toBeInTheDocument();
    // …the surface is still up for a fix or a retry…
    expect(screen.getByRole("dialog", { name: "New Offices" })).toBe(dialog);
    // …and the combobox never saw a failure: its create is still in flight.
    expect(
      screen.getByRole("button", { name: 'Adding "Zurich"…' }),
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Could not add/ })).toBeNull();
    expect(m.field.value ?? null).toBeNull();
  });

  it("cancel leaves the value unchanged and the Add row idle", async () => {
    const creator = createsByForm<Person, Office>();
    const m = await renderPersonOfficeField({
      creator,
      value: { Id: 1, Title: "London" },
    });

    await type("Office", "Zurich");
    fireEvent.click(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    );
    const dialog = await screen.findByRole("dialog", { name: "New Offices" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((m.field.value as Office).Title).toBe("London");
    expect(
      await screen.findByRole("button", { name: 'Add "Zurich"' }),
    ).toBeInTheDocument();
  });
});
