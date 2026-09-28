import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelForm } from "../src/form/SpeelForm.js";
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

function renderTrip(days: number) {
  const ctx = new TripCtx({
    provider: makeFakeProvider({ Trips: [] }),
  } as never);
  const trip = Object.assign(new Trip(), { Id: 1, Title: "Hike", Days: days });
  return render(
    <SpeelProvider db={ctx as never} ui={fakeAdapter}>
      <SpeelForm entity={trip} mode="edit" />
    </SpeelProvider>,
  );
}

describe("entity-level validation surfacing", () => {
  it("stays silent while nothing is touched", () => {
    renderTrip(45);
    expect(screen.queryByText(TOO_LONG)).toBeNull();
  });

  it("renders the entity message in an alert region once a field is touched", async () => {
    renderTrip(45);
    fireEvent.blur(screen.getByLabelText(/Title/));
    const msg = await screen.findByText(TOO_LONG);
    const region = msg.closest("[role='alert']");
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("data-intent", "error");
  });

  it("clears once the values satisfy the rule", async () => {
    renderTrip(45);
    fireEvent.blur(screen.getByLabelText(/Title/));
    await screen.findByText(TOO_LONG);
    fireEvent.change(screen.getByLabelText(/Days/), { target: { value: "7" } });
    await waitFor(() => expect(screen.queryByText(TOO_LONG)).toBeNull());
  });

  it("shows nothing when the entity rule passes", () => {
    renderTrip(7);
    fireEvent.blur(screen.getByLabelText(/Title/));
    expect(screen.queryByText(TOO_LONG)).toBeNull();
  });
});
