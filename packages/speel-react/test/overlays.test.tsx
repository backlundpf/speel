import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { useOverlays } from "../src/surface/useSurfaces.js";
import { fakeAdapter } from "./fakeAdapter.js";
import { makeFakeProvider } from "./fakeProvider.js";

class Task {
  Id?: number;
  Title?: string;
}
class TCtx extends DbContext {
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(Task, (b) => {
      b.toList("Tasks");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
    });
  }
}
const ctx = () =>
  new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);

describe("overlays available under a bare SpeelProvider", () => {
  it("useOverlays resolves toast/tasks/showForm without explicit wrapper providers", () => {
    function Probe() {
      const o = useOverlays();
      return (
        <div>
          {typeof o.toast}-{typeof o.tasks.run}-{typeof o.showForm}
        </div>
      );
    }
    render(
      <SpeelProvider db={ctx() as never} ui={fakeAdapter}>
        <Probe />
      </SpeelProvider>,
    );
    expect(screen.getByText("function-function-function")).toBeInTheDocument();
  });

  it("throws when used outside a provider", () => {
    function Probe() {
      useOverlays();
      return null;
    }
    expect(() => render(<Probe />)).toThrow();
  });
});
