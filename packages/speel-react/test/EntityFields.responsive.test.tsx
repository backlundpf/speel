import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelForm } from "../src/form/SpeelForm.js";
import { useSpeelConfig } from "../src/context.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class R {
  Id?: number;
  Name?: string;
  Notes?: string;
}
class RCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(R, (b) => {
      b.toList("R");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Name)
        .isText()
        .hasDisplayName("Name");
      b.property((e) => e.Notes)
        .isNote()
        .hasDisplayName("Notes");
    });
  }
}
const ctx = () => new RCtx({ provider: makeFakeProvider({ R: [] }) } as never);

describe("responsive field grid", () => {
  it("note (multiline) fields span the full row; other fields do not", () => {
    render(
      <SpeelProvider db={ctx() as never} ui={fakeAdapter}>
        <SpeelForm entity={new R()} mode="edit" fields={["Name", "Notes"]} />
      </SpeelProvider>,
    );
    const cellOf = (el: HTMLElement): HTMLElement | null => el.closest("div");
    expect(
      cellOf(screen.getByLabelText("Notes"))?.getAttribute("style"),
    ).toContain("grid-column");
    expect(
      cellOf(screen.getByLabelText("Name"))?.getAttribute("style"),
    ).not.toContain("grid-column");
  });

  it("exposes the configured scalars via useSpeelConfig (defaults applied)", () => {
    const Probe = (): JSX.Element => {
      const c = useSpeelConfig();
      return (
        <div>{`fcw:${c.fieldColumnMinWidth} fy:${c.fiscalYearStartMonth}`}</div>
      );
    };
    const { rerender } = render(
      <SpeelProvider db={ctx() as never} ui={fakeAdapter}>
        <Probe />
      </SpeelProvider>,
    );
    expect(screen.getByText("fcw:260 fy:10")).toBeInTheDocument();
    rerender(
      <SpeelProvider
        db={ctx() as never}
        ui={fakeAdapter}
        config={{ fieldColumnMinWidth: 320, fiscalYearStartMonth: 4 }}
      >
        <Probe />
      </SpeelProvider>,
    );
    expect(screen.getByText("fcw:320 fy:4")).toBeInTheDocument();
  });
});
