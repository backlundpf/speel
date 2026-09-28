import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { App } from "./DemoApp";

describe("demo app integration", () => {
  it("seeds, renders the dashboard and resolves owners through the fake provider", async () => {
    render(<App />);
    expect(
      await screen.findByText("Heat shield", undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Guidance computer")).toBeInTheDocument();
    expect(screen.getByText("Wing assembly")).toBeInTheDocument();
    // Owner column resolved via the fake provider's user info
    expect(await screen.findByText(/Ada Lovelace/)).toBeInTheDocument();
    // Program lookup nav resolved via .include() — two projects share Apollo
    expect(await screen.findAllByText("Apollo")).toHaveLength(2);
    expect(screen.getByText("Daedalus")).toBeInTheDocument();
  });
});
