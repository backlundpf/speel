import { describe, it, expect, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, act } from "@testing-library/react";
import { useUrlState } from "../src/url/useUrlState.js";
import { urlString, urlBoolean } from "../src/url/codecs.js";
import { __resetUrlStoreForTests } from "../src/url/urlStore.js";

const SPEC = {
  resnum: urlString({ history: "push" }),
  pendingonly: urlBoolean({ default: true }),
};

let firstRenderValue: string | null | undefined;

function Probe(): React.ReactElement {
  const [params, setParams] = useUrlState(SPEC);
  // Captured during render, before any effect — this is the property that lets a
  // consumer derive from a deep-linked value on the first paint.
  if (firstRenderValue === undefined) firstRenderValue = params.resnum;
  return (
    <div>
      <span data-testid="resnum">{String(params.resnum)}</span>
      <span data-testid="pendingonly">{String(params.pendingonly)}</span>
      <button onClick={() => setParams({ resnum: "R-2" })}>select</button>
      <button onClick={() => setParams({ pendingonly: false })}>
        show all
      </button>
      <button onClick={() => setParams({ pendingonly: true })}>
        show pending
      </button>
    </div>
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/page");
  __resetUrlStoreForTests();
  firstRenderValue = undefined;
});

describe("useUrlState", () => {
  it("exposes a deep-linked value during the first render", () => {
    window.history.replaceState(null, "", "/page?resnum=R-1");
    __resetUrlStoreForTests();
    render(<Probe />);
    expect(firstRenderValue).toBe("R-1");
    expect(screen.getByTestId("resnum")).toHaveTextContent("R-1");
  });

  it("falls back to each codec default when the key is absent", () => {
    render(<Probe />);
    expect(screen.getByTestId("resnum")).toHaveTextContent("null");
    expect(screen.getByTestId("pendingonly")).toHaveTextContent("true");
  });

  it("keeps a value equal to its default out of the URL", () => {
    render(<Probe />);
    act(() => {
      screen.getByText("show all").click();
    });
    expect(window.location.search).toContain("pendingonly=false");
    act(() => {
      screen.getByText("show pending").click();
    });
    expect(window.location.search).not.toContain("pendingonly");
    expect(screen.getByTestId("pendingonly")).toHaveTextContent("true");
  });

  it("re-renders when popstate changes the URL", () => {
    render(<Probe />);
    act(() => {
      window.history.replaceState(null, "", "/page?resnum=R-9");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByTestId("resnum")).toHaveTextContent("R-9");
  });

  it("keeps two instances consistent when one of them sets", () => {
    render(
      <>
        <Probe />
        <Probe />
      </>,
    );
    act(() => {
      screen.getAllByText("select")[0]!.click();
    });
    const shown = screen.getAllByTestId("resnum");
    expect(shown).toHaveLength(2);
    for (const node of shown) expect(node).toHaveTextContent("R-2");
  });

  it("preserves a foreign key when setting its own", () => {
    window.history.replaceState(null, "", "/page?env=prod");
    __resetUrlStoreForTests();
    render(<Probe />);
    act(() => {
      screen.getByText("select").click();
    });
    expect(window.location.search).toContain("env=prod");
    expect(window.location.search).toContain("resnum=R-2");
  });
});
