import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MigrationsManager } from "../src/migrations/index.js";
import type { MigrationsRunner } from "../src/migrations/index.js";
import { SpeelUIProvider } from "../src/SpeelUIProvider.js";
import { fakeAdapter } from "./fakeAdapter.js";

/** The migrations UI renders through the skin, so every mount needs one. */
const skin = (node: JSX.Element) =>
  render(<SpeelUIProvider ui={fakeAdapter}>{node}</SpeelUIProvider>);

function fake(over: Partial<MigrationsRunner>): MigrationsRunner {
  return {
    status: vi.fn(),
    migrate: vi.fn(),
    migrateTo: vi.fn(),
    ...over,
  } as unknown as MigrationsRunner;
}

describe("MigrationsManager", () => {
  it("shows Restore for earlier-applied, Apply for pending, and no action for the current migration", async () => {
    // applied [m1, m2] (m2 = current), pending [m3]
    const migrator = fake({
      status: vi
        .fn()
        .mockResolvedValue({ applied: ["m1", "m2"], pending: ["m3"] }),
    });
    skin(<MigrationsManager migrator={migrator} />);

    await waitFor(() =>
      expect(
        screen.getByText("2 of 3 applied · 1 pending"),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(1); // m1 only (m2 is current)
    expect(screen.getAllByRole("button", { name: "Apply" })).toHaveLength(1); // m3
    expect(screen.getByText("current")).toBeInTheDocument(); // m2 has no action
  });

  it("applies a pending migration via its Apply link (migrateTo)", async () => {
    const status = vi
      .fn()
      .mockResolvedValueOnce({ applied: ["m1", "m2"], pending: ["m3"] })
      .mockResolvedValueOnce({ applied: ["m1", "m2", "m3"], pending: [] });
    const migrateTo = vi
      .fn()
      .mockResolvedValue({ direction: "up", ran: ["m3"] });
    skin(<MigrationsManager migrator={fake({ status, migrateTo })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(migrateTo).toHaveBeenCalledWith(
        "m3",
        expect.objectContaining({ onProgress: expect.any(Function) }),
      ),
    );
  });

  it("restores via the Restore link after a confirm (migrateTo down)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const status = vi
      .fn()
      .mockResolvedValue({ applied: ["m1", "m2"], pending: [] });
    const migrateTo = vi
      .fn()
      .mockResolvedValue({ direction: "down", ran: ["m2"] });
    skin(<MigrationsManager migrator={fake({ status, migrateTo })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Restore" })); // revert to m1 (undo m2)
    await waitFor(() =>
      expect(migrateTo).toHaveBeenCalledWith(
        "m1",
        expect.objectContaining({ onProgress: expect.any(Function) }),
      ),
    );
  });

  it("does not restore when the confirm is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const migrateTo = vi.fn();
    skin(
      <MigrationsManager
        migrator={fake({
          status: vi
            .fn()
            .mockResolvedValue({ applied: ["m1", "m2"], pending: [] }),
          migrateTo,
        })}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(migrateTo).not.toHaveBeenCalled();
  });

  it("applies all pending via the primary button and calls onApplied", async () => {
    const status = vi
      .fn()
      .mockResolvedValueOnce({ applied: [], pending: ["m1", "m2"] })
      .mockResolvedValueOnce({ applied: ["m1", "m2"], pending: [] });
    const migrate = vi
      .fn()
      .mockResolvedValue({ direction: "up", ran: ["m1", "m2"] });
    const onApplied = vi.fn();
    skin(
      <MigrationsManager
        migrator={fake({ status, migrate })}
        onApplied={onApplied}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Apply 2 pending/ }),
    );
    await waitFor(() => expect(migrate).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText("2 of 2 applied")).toBeInTheDocument(),
    );
    expect(onApplied).toHaveBeenCalledWith({
      direction: "up",
      ran: ["m1", "m2"],
    });
  });

  it("shows an error message when a run fails", async () => {
    const migrate = vi.fn().mockRejectedValue(new Error("SharePoint said no"));
    skin(
      <MigrationsManager
        migrator={fake({
          status: vi.fn().mockResolvedValue({ applied: [], pending: ["m1"] }),
          migrate,
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Apply 1 pending/ }),
    );
    await waitFor(() =>
      expect(screen.getByText("SharePoint said no")).toBeInTheDocument(),
    );
  });
});

describe("MigrationsManager preview", () => {
  const emptyPlan = { direction: "up" as const, steps: [] };

  it("renders no preview button when the runner cannot plan", async () => {
    const migrator = fake({
      status: vi.fn().mockResolvedValue({ applied: [], pending: ["m1"] }),
    });
    skin(<MigrationsManager migrator={migrator} />);
    await screen.findByRole("button", { name: "Apply" });
    expect(
      screen.queryByRole("button", { name: /Preview/ }),
    ).not.toBeInTheDocument();
  });

  it("mirrors the row action for a pending row — what Apply would run", async () => {
    const plan = vi.fn().mockResolvedValue(emptyPlan);
    const migrator = fake({
      status: vi.fn().mockResolvedValue({ applied: [], pending: ["m1"] }),
      plan,
    });
    skin(<MigrationsManager migrator={migrator} />);

    fireEvent.click(await screen.findByRole("button", { name: "Preview m1" }));
    await waitFor(() =>
      expect(plan).toHaveBeenCalledWith({ to: "m1", annotate: true }),
    );
  });

  it("mirrors the row action for an earlier-applied row — the down steps Restore would run", async () => {
    const downPlan = {
      direction: "down" as const,
      steps: [
        {
          migrationId: "m2",
          direction: "down" as const,
          summary: 'Delete list "B" (to the site recycle bin)',
          willRun: true,
          destructive: true,
          presence: "present" as const,
          opaque: false,
        },
      ],
    };
    const plan = vi.fn().mockResolvedValue(downPlan);
    const migrator = fake({
      status: vi.fn().mockResolvedValue({ applied: ["m1", "m2"], pending: [] }),
      plan,
    });
    skin(<MigrationsManager migrator={migrator} />);

    fireEvent.click(await screen.findByRole("button", { name: "Preview m1" }));
    await waitFor(() =>
      expect(plan).toHaveBeenCalledWith({ to: "m1", annotate: true }),
    );
    expect(
      await screen.findByText('Delete list "B" (to the site recycle bin)'),
    ).toBeInTheDocument();
    expect(screen.getByText("down")).toBeInTheDocument();
  });

  it("previews the current row on its own — it has no action to mirror", async () => {
    const plan = vi.fn().mockResolvedValue(emptyPlan);
    const migrator = fake({
      status: vi.fn().mockResolvedValue({ applied: ["m1", "m2"], pending: [] }),
      plan,
    });
    skin(<MigrationsManager migrator={migrator} />);

    fireEvent.click(await screen.findByRole("button", { name: "Preview m2" })); // m2 is current
    await waitFor(() =>
      expect(plan).toHaveBeenCalledWith({ only: "m2", annotate: true }),
    );
  });

  it("surfaces a planning failure as an error message", async () => {
    const plan = vi.fn().mockRejectedValue(new Error("plan blew up"));
    const migrator = fake({
      status: vi.fn().mockResolvedValue({ applied: [], pending: ["m1"] }),
      plan,
    });
    skin(<MigrationsManager migrator={migrator} />);

    fireEvent.click(await screen.findByRole("button", { name: "Preview m1" }));
    await waitFor(() =>
      expect(screen.getByText("plan blew up")).toBeInTheDocument(),
    );
  });
});

describe("MigrationsManager mark applied", () => {
  const planOf = (presence: "present" | "absent") => ({
    direction: "up" as const,
    steps: [
      {
        migrationId: "m1",
        direction: "up" as const,
        summary: 'Create list "A"',
        willRun: true,
        destructive: false,
        presence,
        opaque: false,
      },
    ],
  });

  it("calls markApplied and refreshes status", async () => {
    const status = vi
      .fn()
      .mockResolvedValueOnce({ applied: [], pending: ["m1"] })
      .mockResolvedValue({ applied: ["m1"], pending: [] });
    const markApplied = vi.fn().mockResolvedValue(undefined);
    const migrator = fake({
      status,
      plan: vi.fn().mockResolvedValue(planOf("present")),
      markApplied,
    });
    skin(<MigrationsManager migrator={migrator} />);

    fireEvent.click(await screen.findByRole("button", { name: "Preview m1" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Mark applied" }),
    );

    await waitFor(() => expect(markApplied).toHaveBeenCalledWith("m1"));
    await waitFor(() =>
      expect(screen.getByText("1 of 1 applied")).toBeInTheDocument(),
    );
  });

  it("applies from the preview panel, closes it, and refreshes status", async () => {
    const status = vi
      .fn()
      .mockResolvedValueOnce({ applied: [], pending: ["m1"] })
      .mockResolvedValue({ applied: ["m1"], pending: [] });
    const migrateTo = vi
      .fn()
      .mockResolvedValue({ direction: "up", ran: ["m1"] });
    const migrator = fake({
      status,
      migrateTo,
      plan: vi.fn().mockResolvedValue(planOf("absent")),
      markApplied: vi.fn(),
    });
    skin(<MigrationsManager migrator={migrator} />);

    fireEvent.click(await screen.findByRole("button", { name: "Preview m1" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply m1" }));

    await waitFor(() =>
      expect(migrateTo).toHaveBeenCalledWith(
        "m1",
        expect.objectContaining({ onProgress: expect.any(Function) }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByText("1 of 1 applied")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Apply m1" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer Apply for an already-applied migration", async () => {
    const migrator = fake({
      status: vi.fn().mockResolvedValue({ applied: ["m1", "m2"], pending: [] }),
      plan: vi.fn().mockResolvedValue({ direction: "up", steps: [] }),
      markApplied: vi.fn(),
    });
    skin(<MigrationsManager migrator={migrator} />);

    fireEvent.click(await screen.findByRole("button", { name: "Preview m1" }));
    await screen.findByText("Nothing in this migration will run.");
    expect(
      screen.queryByRole("button", { name: "Apply m1" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer Mark applied for an already-applied migration", async () => {
    const migrator = fake({
      status: vi.fn().mockResolvedValue({ applied: ["m1", "m2"], pending: [] }),
      plan: vi.fn().mockResolvedValue({ direction: "up", steps: [] }),
      markApplied: vi.fn(),
    });
    skin(<MigrationsManager migrator={migrator} />);

    fireEvent.click(await screen.findByRole("button", { name: "Preview m1" }));
    await screen.findByText("Nothing in this migration will run.");
    expect(
      screen.queryByRole("button", { name: "Mark applied" }),
    ).not.toBeInTheDocument();
  });
});
