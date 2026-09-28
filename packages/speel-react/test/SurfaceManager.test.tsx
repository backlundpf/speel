import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { SurfaceManager } from "../src/surface/SurfaceManager.js";
import { useSurfaces } from "../src/surface/useSurfaces.js";
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
      b.property((e) => e.Title)
        .isText()
        .hasDisplayName("Title");
    });
  }
}
const ctx = () =>
  new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);

function Harness({
  onResult,
  opts,
}: {
  onResult: (r: unknown) => void;
  opts: Record<string, unknown>;
}) {
  const { showForm } = useSurfaces();
  return (
    <button onClick={() => void showForm(opts as never).then(onResult)}>
      open
    </button>
  );
}
function mount(
  c: DbContext,
  onResult: (r: unknown) => void,
  opts: Record<string, unknown>,
) {
  return render(
    <SpeelProvider db={c as never} ui={fakeAdapter}>
      <SurfaceManager>
        <Harness onResult={onResult} opts={opts} />
      </SurfaceManager>
    </SpeelProvider>,
  );
}

describe("SurfaceManager.showForm", () => {
  it("defaults to a panel and resolves cancel on dismiss", async () => {
    const onResult = vi.fn();
    mount(ctx(), onResult, {
      entity: Object.assign(new Task(), { Id: 1, Title: "T" }),
      mode: "edit",
    });
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByRole("dialog", { name: /panel/ })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("dismiss"));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        action: "cancel",
        entity: expect.any(Object),
      }),
    );
  });

  it("resolves submit after a successful save (modal, create)", async () => {
    const c = ctx();
    vi.spyOn(c.set(Task), "add").mockImplementation((e) => e as never);
    const save = vi
      .spyOn(c, "saveChangesAsync")
      .mockResolvedValue(undefined as never);
    const onResult = vi.fn();
    mount(c, onResult, {
      surface: "modal",
      entity: Object.assign(new Task(), { Title: "New" }),
      mode: "create",
    });
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        action: "submit",
        entity: expect.any(Object),
      }),
    );
    expect(save).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the surface open and the promise pending when save fails", async () => {
    const c = ctx();
    vi.spyOn(c.set(Task), "add").mockImplementation((e) => e as never);
    vi.spyOn(c, "saveChangesAsync").mockRejectedValue(new Error("boom"));
    const onResult = vi.fn();
    mount(c, onResult, {
      surface: "modal",
      entity: Object.assign(new Task(), { Title: "X" }),
      mode: "create",
    });
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText(/boom/)).toBeInTheDocument());
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("forwards defaultFullscreen to a modal form", () => {
    mount(ctx(), vi.fn(), {
      surface: "modal",
      defaultFullscreen: true,
      entity: Object.assign(new Task(), { Id: 1, Title: "T" }),
      mode: "edit",
    });
    fireEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "data-fullscreen",
      "true",
    );
  });

  it("stacks: a second showForm renders on top, resolving it leaves the first pending", async () => {
    const onResult = vi.fn();
    function Two() {
      const { showForm } = useSurfaces();
      return (
        <button
          onClick={() => {
            void showForm({
              surface: "modal",
              entity: Object.assign(new Task(), { Id: 1, Title: "A" }),
              mode: "edit",
            }).then(() => onResult("first"));
            void showForm({
              surface: "panel",
              entity: Object.assign(new Task(), { Id: 2, Title: "B" }),
              mode: "edit",
            }).then(() => onResult("second"));
          }}
        >
          open2
        </button>
      );
    }
    render(
      <SpeelProvider db={ctx() as never} ui={fakeAdapter}>
        <SurfaceManager>
          <Two />
        </SurfaceManager>
      </SpeelProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "open2" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    const panel = screen.getByRole("dialog", { name: "panel" });
    fireEvent.click(within(panel).getByLabelText("dismiss"));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("second"));
    expect(onResult).not.toHaveBeenCalledWith("first");
  });
});
