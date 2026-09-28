import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DbContext, ModelBuilder } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import { useEntityForm } from "../src/form/useEntityForm.js";
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

describe("useEntityForm beforeSubmit", () => {
  it("runs beforeSubmit before save; a throw aborts the save and surfaces the error", async () => {
    const c = new TCtx({ provider: makeFakeProvider({ Tasks: [] }) } as never);
    const saveSpy = vi
      .spyOn(c, "saveChangesAsync")
      .mockResolvedValue(undefined as never);
    const beforeSubmit = vi.fn().mockRejectedValue(new Error("nope"));
    function Probe() {
      const ef = useEntityForm(
        Object.assign(new Task(), { Id: 1, Title: "T" }),
        "edit",
        { beforeSubmit },
      );
      return (
        <button onClick={() => void ef.submit()}>
          go{ef.submitError ? `:${ef.submitError}` : ""}
        </button>
      );
    }
    render(
      <SpeelProvider db={c as never} ui={fakeAdapter}>
        <Probe />
      </SpeelProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText(/nope/)).toBeInTheDocument());
    expect(beforeSubmit).toHaveBeenCalledTimes(1);
    expect(saveSpy).not.toHaveBeenCalled();
  });
});
