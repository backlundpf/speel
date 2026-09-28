import * as React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { useFiscalYearStart } from "../src/context.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class E {
  Id?: number;
}
class C extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(E, (b) => {
      b.toList("Es");
      b.property((e) => e.Id).isNumber();
    });
  }
}
const Probe: React.FC = () => <div>fy:{useFiscalYearStart()}</div>;
const ctx = () => new C({ provider: makeFakeProvider({}) } as never);

describe("fiscalYearStartMonth", () => {
  it("defaults to 10 (US federal)", () => {
    render(
      <SpeelProvider db={ctx() as never} ui={fakeAdapter}>
        <Probe />
      </SpeelProvider>,
    );
    expect(screen.getByText("fy:10")).toBeInTheDocument();
  });
  it("honors an override", () => {
    render(
      <SpeelProvider
        db={ctx() as never}
        ui={fakeAdapter}
        config={{ fiscalYearStartMonth: 7 }}
      >
        <Probe />
      </SpeelProvider>,
    );
    expect(screen.getByText("fy:7")).toBeInTheDocument();
  });
});
