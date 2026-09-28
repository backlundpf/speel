import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DbContext } from "@speel/core";
import { SpeelProvider } from "../src/SpeelProvider.js";
import {
  useSpeelContext,
  useSpeelUI,
  usePeopleSearch,
} from "../src/context.js";
import { fakeAdapter } from "./fakeAdapter.js";

const fakeDb = { marker: "db" } as unknown as DbContext;

function Probe() {
  const db = useSpeelContext();
  const ui = useSpeelUI();
  const ps = usePeopleSearch();
  return (
    <div>
      {(db as unknown as { marker: string }).marker}:{typeof ui.TextInput}:
      {ps ? "has-ps" : "no-ps"}
    </div>
  );
}

describe("SpeelProvider", () => {
  it("provides db, ui adapter, and optional peopleSearch", () => {
    render(
      <SpeelProvider db={fakeDb} ui={fakeAdapter} peopleSearch={async () => []}>
        <Probe />
      </SpeelProvider>,
    );
    expect(screen.getByText("db:function:has-ps")).toBeInTheDocument();
  });
  it("useSpeelContext throws outside a provider", () => {
    expect(() => render(<Probe />)).toThrow(/SpeelProvider/);
  });
});
