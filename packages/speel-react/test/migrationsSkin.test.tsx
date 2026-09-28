import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { SpeelUIProvider } from "../src/SpeelUIProvider.js";
import {
  MigrationPreviewPanel,
  MigrationsManager,
  type MigrationsPlan,
  type MigrationsRunner,
} from "../src/migrations/index.js";
import { fakeAdapter } from "./fakeAdapter.js";

const plan: MigrationsPlan = {
  direction: "up",
  steps: [
    {
      migrationId: "m1",
      direction: "up",
      summary: 'Create list "A"',
      willRun: true,
      destructive: false,
      presence: "absent",
      opaque: false,
    },
  ],
};

const skin = (node: JSX.Element) =>
  render(<SpeelUIProvider ui={fakeAdapter}>{node}</SpeelUIProvider>);

describe("the migrations UI renders through the skin", () => {
  it("the preview is a Speel panel — skin chrome, resize handle and all", () => {
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={plan}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("dialog", { name: "Preview — m1" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
  });

  it("the preview's actions sit in the panel footer, not loose in the body", () => {
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={plan}
        onDismiss={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    const footer = screen.getByTestId("surface-footer");
    expect(
      within(footer).getByRole("button", { name: "Apply m1" }),
    ).toBeInTheDocument();
  });

  it("the manager reports failure through the skin's message bar", async () => {
    const migrator: MigrationsRunner = {
      status: () => Promise.reject(new Error("SharePoint said no")),
      migrate: () => Promise.resolve({ direction: "up", ran: [] }),
      migrateTo: () => Promise.resolve({ direction: "up", ran: [] }),
    };
    skin(<MigrationsManager migrator={migrator} />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveAttribute("data-intent", "error"),
    );
    expect(screen.getByText("SharePoint said no")).toBeInTheDocument();
  });
});
