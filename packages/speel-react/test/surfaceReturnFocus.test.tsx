import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SpeelModal } from "../src/surface/SpeelModal.js";
import { SpeelPanel } from "../src/surface/SpeelPanel.js";
import { SurfaceManager } from "../src/surface/SurfaceManager.js";
import { useSurfaces } from "../src/surface/useSurfaces.js";
import type {
  DialogProps,
  DrawerProps,
  SpeelUIAdapter,
} from "../src/adapter/SpeelUIAdapter.js";
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

const seen: { dialog: DialogProps[]; drawer: DrawerProps[] } = {
  dialog: [],
  drawer: [],
};
const last = <T,>(xs: T[]): T | undefined => xs[xs.length - 1];
// React's dev-only warning stacks call a component with no props; those calls carry
// nothing to record.
const FakeDialog = fakeAdapter.Dialog;
const FakeDrawer = fakeAdapter.Drawer;
const recording: SpeelUIAdapter = {
  ...fakeAdapter,
  Dialog: (p) => {
    if (p) seen.dialog.push(p);
    return <FakeDialog {...p} />;
  },
  Drawer: (p) => {
    if (p) seen.drawer.push(p);
    return <FakeDrawer {...p} />;
  },
};

const wrap = (node: JSX.Element) =>
  render(
    <SpeelProvider
      db={
        new TCtx({
          provider: makeFakeProvider({ Tasks: [] }),
        } as never) as never
      }
      ui={recording}
    >
      <SurfaceManager>{node}</SurfaceManager>
    </SpeelProvider>,
  );

const target = document.createElement("button");
const entity = () => Object.assign(new Task(), { Id: 1, Title: "T" });

describe("returnFocus reaches the skin from every surface", () => {
  it("SpeelPanel, content variant", () => {
    wrap(
      <SpeelPanel open onOpenChange={() => {}} returnFocus={target}>
        x
      </SpeelPanel>,
    );
    expect(last(seen.drawer)?.returnFocus).toBe(target);
  });

  it("SpeelModal, content variant", () => {
    wrap(
      <SpeelModal open onOpenChange={() => {}} returnFocus={false}>
        x
      </SpeelModal>,
    );
    expect(last(seen.dialog)?.returnFocus).toBe(false);
  });

  it("SpeelPanel and SpeelModal, form variant", () => {
    wrap(
      <>
        <SpeelPanel
          open
          onOpenChange={() => {}}
          entity={entity()}
          returnFocus={target}
        />
        <SpeelModal
          open
          onOpenChange={() => {}}
          entity={entity()}
          returnFocus={target}
        />
      </>,
    );
    expect(last(seen.drawer)?.returnFocus).toBe(target);
    expect(last(seen.dialog)?.returnFocus).toBe(target);
  });

  it("showForm", () => {
    seen.drawer.length = 0;
    function Harness() {
      const { showForm } = useSurfaces();
      return (
        <button
          onClick={() =>
            void showForm({ entity: entity(), returnFocus: target } as never)
          }
        >
          open
        </button>
      );
    }
    wrap(<Harness />);
    fireEvent.click(screen.getByText("open"));
    expect(last(seen.drawer)?.returnFocus).toBe(target);
  });
});
