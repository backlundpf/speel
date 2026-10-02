import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MigrationsManager } from "../src/migrations/index.js";
import type {
  MigrationsRunner,
  MigrationsEvent,
  MigrationProgress,
} from "../src/migrations/index.js";
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

const pendingOne = { applied: [], pending: ["20260101T0900_First"] };
const ID = "20260101T0900_First";

/** A migrate() that replays `script` through onProgress, then resolves. */
function scripted(script: MigrationsEvent[]) {
  return vi.fn(async (opts?: MigrationProgress) => {
    for (const e of script) opts?.onProgress?.(e);
    return { direction: "up" as const, ran: [ID] };
  });
}

const start = (): MigrationsEvent => ({
  kind: "migration-start",
  migrationId: ID,
  direction: "up",
});
const done = (): MigrationsEvent => ({
  kind: "migration-done",
  migrationId: ID,
  direction: "up",
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MigrationsManager output log", () => {
  it("streams each step, grouped under the migration it belongs to", async () => {
    const migrate = scripted([
      start(),
      { kind: "step-start", migrationId: ID, summary: 'Create list "Alpha"' },
      {
        kind: "step-done",
        migrationId: ID,
        summary: 'Create list "Alpha"',
        status: "applied",
      },
      {
        kind: "step-done",
        migrationId: ID,
        summary: 'Add field Done (Boolean) to "Alpha"',
        status: "skipped",
      },
      done(),
    ]);
    skin(
      <MigrationsManager
        migrator={fake({
          status: vi.fn().mockResolvedValue(pendingOne),
          migrate,
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Apply 1 pending/ }),
    );
    await waitFor(() =>
      expect(screen.getByText(`Applying ${ID}`)).toBeInTheDocument(),
    );
    expect(screen.getByText('✓ Create list "Alpha"')).toBeInTheDocument();
    expect(
      screen.getByText('↷ Add field Done (Boolean) to "Alpha" — already there'),
    ).toBeInTheDocument();
  });

  it("marks the step in flight until its result arrives", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const migrate = vi.fn(async (opts?: MigrationProgress) => {
      opts?.onProgress?.(start());
      opts?.onProgress?.({
        kind: "step-start",
        migrationId: ID,
        summary: 'Create list "Alpha"',
      });
      await gate;
      opts?.onProgress?.({
        kind: "step-done",
        migrationId: ID,
        summary: 'Create list "Alpha"',
        status: "applied",
      });
      opts?.onProgress?.(done());
      return { direction: "up" as const, ran: [ID] };
    });
    skin(
      <MigrationsManager
        migrator={fake({
          status: vi.fn().mockResolvedValue(pendingOne),
          migrate,
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Apply 1 pending/ }),
    );
    // In flight: the step that is taking the time is the one on screen.
    await waitFor(() =>
      expect(screen.getByText('… Create list "Alpha"')).toBeInTheDocument(),
    );
    release();
    await waitFor(() =>
      expect(screen.getByText('✓ Create list "Alpha"')).toBeInTheDocument(),
    );
  });

  it("shows a failed step with its message and keeps the log", async () => {
    const migrate = vi.fn(async (opts?: MigrationProgress) => {
      opts?.onProgress?.(start());
      opts?.onProgress?.({
        kind: "step-start",
        migrationId: ID,
        summary: 'Create list "Alpha"',
      });
      opts?.onProgress?.({
        kind: "step-done",
        migrationId: ID,
        summary: 'Create list "Alpha"',
        status: "failed",
        error: "the server said no",
      });
      throw new Error("migration failed");
    });
    skin(
      <MigrationsManager
        migrator={fake({
          status: vi.fn().mockResolvedValue(pendingOne),
          migrate,
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Apply 1 pending/ }),
    );
    await waitFor(() =>
      expect(
        screen.getByText('✗ Create list "Alpha" — the server said no'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("migration failed")).toBeInTheDocument();
  });

  it("clears the previous run's output when the next run starts", async () => {
    const status = vi.fn().mockResolvedValue(pendingOne);
    const first = scripted([
      start(),
      {
        kind: "step-done",
        migrationId: ID,
        summary: 'Create list "Alpha"',
        status: "applied",
      },
      done(),
    ]);
    const second = scripted([
      start(),
      {
        kind: "step-done",
        migrationId: ID,
        summary: 'Create list "Beta"',
        status: "applied",
      },
      done(),
    ]);
    const migrate = vi
      .fn()
      .mockImplementationOnce(first)
      .mockImplementationOnce(second);
    skin(<MigrationsManager migrator={fake({ status, migrate })} />);

    fireEvent.click(
      await screen.findByRole("button", { name: /Apply 1 pending/ }),
    );
    await waitFor(() =>
      expect(screen.getByText('✓ Create list "Alpha"')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Apply 1 pending/ }));
    await waitFor(() =>
      expect(screen.getByText('✓ Create list "Beta"')).toBeInTheDocument(),
    );
    expect(screen.queryByText('✓ Create list "Alpha"')).toBeNull();
  });

  it("renders no log box before the first run", async () => {
    skin(
      <MigrationsManager
        migrator={fake({ status: vi.fn().mockResolvedValue(pendingOne) })}
      />,
    );
    await screen.findByRole("button", { name: /Apply 1 pending/ });
    expect(screen.queryByRole("log")).toBeNull();
  });
});

describe("MigrationsManager devtools mirror", () => {
  it("groups the run in the console and closes the group when it ends", async () => {
    const group = vi.spyOn(console, "group").mockImplementation(() => {});
    const groupEnd = vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const migrate = scripted([
      start(),
      {
        kind: "step-done",
        migrationId: ID,
        summary: 'Create list "Alpha"',
        status: "applied",
      },
      done(),
    ]);
    skin(
      <MigrationsManager
        migrator={fake({
          status: vi.fn().mockResolvedValue(pendingOne),
          migrate,
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Apply 1 pending/ }),
    );
    await waitFor(() => expect(groupEnd).toHaveBeenCalled());
    expect(group).toHaveBeenCalledWith(`Applying ${ID}`);
    expect(log).toHaveBeenCalledWith('✓ Create list "Alpha"');
  });

  it("closes the console group when the run throws mid-migration", async () => {
    vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const groupEnd = vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    const migrate = vi.fn(async (opts?: MigrationProgress) => {
      opts?.onProgress?.(start());
      throw new Error("SharePoint said no");
    });
    skin(
      <MigrationsManager
        migrator={fake({
          status: vi.fn().mockResolvedValue(pendingOne),
          migrate,
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Apply 1 pending/ }),
    );
    // No migration-done arrives, so the panel closes the group itself —
    // otherwise every later log would render nested inside a dead run.
    await waitFor(() => expect(groupEnd).toHaveBeenCalledTimes(1));
  });
});

describe("MigrationsManager data-loss warnings", () => {
  const SUMMARY = 'Alter field Value (Text) on "Config"';
  const WARNING =
    "Converting Value from Note to Text truncates existing values to 255 characters.";

  it("shows the warning under the step while it runs and after it lands", async () => {
    vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const migrate = scripted([
      start(),
      {
        kind: "step-start",
        migrationId: ID,
        summary: SUMMARY,
        warning: WARNING,
      },
      {
        kind: "step-done",
        migrationId: ID,
        summary: SUMMARY,
        status: "applied",
        warning: WARNING,
      },
      done(),
    ]);
    skin(
      <MigrationsManager
        migrator={fake({
          status: vi.fn().mockResolvedValue(pendingOne),
          migrate,
        })}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Apply 1 pending/ }),
    );
    await waitFor(() =>
      expect(screen.getByText(`✓ ${SUMMARY}`)).toBeInTheDocument(),
    );
    expect(screen.getByText(`⚠ May lose data: ${WARNING}`)).toBeInTheDocument();
    // The devtools mirror raises it too, as a warning rather than a log line.
    expect(warn).toHaveBeenCalledWith(
      `✓ ${SUMMARY}\n⚠ May lose data: ${WARNING}`,
    );
  });

  it("shows no warning line for a step without one", async () => {
    vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const migrate = scripted([
      start(),
      {
        kind: "step-done",
        migrationId: ID,
        summary: SUMMARY,
        status: "applied",
      },
      done(),
    ]);
    skin(
      <MigrationsManager
        migrator={fake({
          status: vi.fn().mockResolvedValue(pendingOne),
          migrate,
        })}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Apply 1 pending/ }),
    );
    await waitFor(() =>
      expect(screen.getByText(`✓ ${SUMMARY}`)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/May lose data/)).not.toBeInTheDocument();
  });
});
