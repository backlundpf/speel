import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  DbContext,
  ModelBuilder,
  type IBatchOperation,
  type IEntity,
} from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelForm } from "../src/form/SpeelForm.js";
import {
  useEntityForm,
  EntityFormProvider,
  type EntityForm,
} from "../src/form/useEntityForm.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

const TOO_LONG = "A trip cannot exceed 30 days.";

class Trip {
  Id?: number;
  Title?: string;
  Days?: number;
}
class TripCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Trip, (b) => {
      b.toList("Trips");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title)
        .isText()
        .isRequired()
        .hasDisplayName("Title");
      b.property((e) => e.Days)
        .isNumber()
        .hasDisplayName("Days");
      b.hasValidation(
        (ctx) => ((ctx.values.Days as number) ?? 0) <= 30,
        TOO_LONG,
      );
    });
  }
}

function renderForm() {
  const batchOps: IBatchOperation[] = [];
  const ctx = new TripCtx({
    provider: makeFakeProvider({ Trips: [] }, { batchOps }),
  } as never);
  const trip = Object.assign(new Trip(), { Id: 1, Title: "Hike", Days: 10 });
  const onSaved = vi.fn();
  render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <SpeelForm entity={trip} mode="edit" onSaved={onSaved} />
    </SpeelProvider>,
  );
  return { batchOps, onSaved };
}

/** Edit the draft into an invalid state — this is what ran the validators and greyed Save out. */
function makeInvalid() {
  fireEvent.change(screen.getByLabelText(/Days/), { target: { value: "45" } });
  fireEvent.change(screen.getByLabelText(/Title/), { target: { value: "" } });
}

describe("empty-submit feedback", () => {
  it("leaves Save clickable while the draft is invalid", () => {
    renderForm();
    makeInvalid();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("clicking Save on an invalid draft surfaces every error and does not save", async () => {
    const { batchOps, onSaved } = renderForm();
    makeInvalid();
    // Untouched so far: no field error, no entity message.
    expect(screen.queryByText("Title is required.")).toBeNull();
    expect(screen.queryByText(TOO_LONG)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(screen.getByText(TOO_LONG)).toBeInTheDocument();
    expect(batchOps).toHaveLength(0);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("keeps canSubmit on the form handle for custom footers", async () => {
    let handle: EntityForm | undefined;
    function Harness() {
      const ef = useEntityForm(
        Object.assign(new Trip(), {
          Id: 1,
          Title: "Hike",
          Days: 10,
        }) as IEntity,
        "edit",
      );
      handle = ef;
      return (
        <EntityFormProvider value={ef}>
          <span>canSubmit: {String(ef.canSubmit)}</span>
        </EntityFormProvider>
      );
    }
    const ctx = new TripCtx({
      provider: makeFakeProvider({ Trips: [] }),
    } as never);
    render(
      <SpeelProvider db={ctx as never} ui={fakeAdapter}>
        <Harness />
      </SpeelProvider>,
    );
    handle!.form.setFieldValue("Days", 45);
    expect(await screen.findByText("canSubmit: false")).toBeInTheDocument();
    handle!.form.setFieldValue("Days", 7);
    expect(await screen.findByText("canSubmit: true")).toBeInTheDocument();
  });
});
