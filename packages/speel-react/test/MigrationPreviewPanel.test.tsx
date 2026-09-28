import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MigrationPreviewPanel } from "../src/migrations/index.js";
import type { MigrationsPlan } from "../src/migrations/index.js";
import { SpeelUIProvider } from "../src/SpeelUIProvider.js";
import { fakeAdapter } from "./fakeAdapter.js";

/** The migrations UI renders through the skin, so every mount needs one. */
const skin = (node: JSX.Element) =>
  render(<SpeelUIProvider ui={fakeAdapter}>{node}</SpeelUIProvider>);

const plan: MigrationsPlan = {
  direction: "up",
  steps: [
    {
      migrationId: "m1",
      direction: "up",
      summary: 'Create list "A"',
      willRun: true,
      destructive: false,
      presence: "present",
      opaque: false,
    },
    {
      migrationId: "m1",
      direction: "up",
      summary: 'Drop field Old from "A"',
      willRun: true,
      destructive: true,
      presence: "absent",
      opaque: false,
    },
    {
      migrationId: "m1",
      direction: "up",
      summary: "backfill statuses",
      willRun: false,
      destructive: false,
      presence: "unknown",
      opaque: true,
      label: "backfill statuses",
      source: "async () => { /* x */ }",
    },
  ],
};

describe("MigrationPreviewPanel", () => {
  it("shows a spinner while the plan is loading", () => {
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("Planning…")).toBeInTheDocument();
  });

  it("lists only the steps that will run by default", () => {
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={plan}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText('Create list "A"')).toBeInTheDocument();
    expect(screen.getByText('Drop field Old from "A"')).toBeInTheDocument();
    expect(screen.queryByText("backfill statuses")).not.toBeInTheDocument();
  });

  it("shows every step, including skipped ones, once toggled", () => {
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={plan}
        onDismiss={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /show all steps/i }));
    expect(screen.getByText("backfill statuses")).toBeInTheDocument();
    expect(screen.getByText("async () => { /* x */ }")).toBeInTheDocument();
  });

  it("flags destructive steps and reports live presence", () => {
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={plan}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("destructive")).toBeInTheDocument();
    expect(screen.getByText("already present")).toBeInTheDocument();
    expect(screen.getByText("not present")).toBeInTheDocument();
  });

  it("labels each step with its migration when the plan spans more than one", () => {
    const spanning: MigrationsPlan = {
      direction: "down",
      steps: [
        {
          migrationId: "m3",
          direction: "down",
          summary: 'Delete list "C" (to the site recycle bin)',
          willRun: true,
          destructive: true,
          presence: "present",
          opaque: false,
        },
        {
          migrationId: "m2",
          direction: "down",
          summary: 'Drop field Old from "A"',
          willRun: true,
          destructive: true,
          presence: "present",
          opaque: false,
        },
      ],
    };
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={spanning}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("m3")).toBeInTheDocument();
    expect(screen.getByText("m2")).toBeInTheDocument();
  });

  it("omits the migration label when every step belongs to one migration", () => {
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={plan}
        onDismiss={() => {}}
      />,
    );
    expect(screen.queryByText("m1")).not.toBeInTheDocument();
  });

  it("says so when nothing in the migration will run", () => {
    const applied: MigrationsPlan = {
      direction: "up",
      steps: plan.steps.map((s) => ({ ...s, willRun: false })),
    };
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={applied}
        onDismiss={() => {}}
      />,
    );
    expect(
      screen.getByText("Nothing in this migration will run."),
    ).toBeInTheDocument();
  });
});

describe("MigrationPreviewPanel mark applied", () => {
  const allPresent: MigrationsPlan = {
    direction: "up",
    steps: [
      {
        migrationId: "m1",
        direction: "up",
        summary: 'Create list "A"',
        willRun: true,
        destructive: false,
        presence: "present",
        opaque: false,
      },
      {
        migrationId: "m1",
        direction: "up",
        summary: 'Add field Title (Text) to "A"',
        willRun: true,
        destructive: false,
        presence: "present",
        opaque: false,
      },
    ],
  };
  const someAbsent: MigrationsPlan = {
    direction: "up",
    steps: [
      ...allPresent.steps,
      {
        migrationId: "m1",
        direction: "up",
        summary: 'Add field New (Text) to "A"',
        willRun: true,
        destructive: false,
        presence: "absent",
        opaque: false,
      },
    ],
  };

  it("offers no Mark applied action when the runner cannot do it", () => {
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={allPresent}
        onDismiss={() => {}}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Mark applied" }),
    ).not.toBeInTheDocument();
  });

  it("marks applied without confirmation when every step is already present", () => {
    const onMarkApplied = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={allPresent}
        onDismiss={() => {}}
        onMarkApplied={onMarkApplied}
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark applied" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onMarkApplied).toHaveBeenCalledTimes(1);
  });

  it("warns and confirms when a step would actually change the site", async () => {
    const onMarkApplied = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={someAbsent}
        onDismiss={() => {}}
        onMarkApplied={onMarkApplied}
      />,
    );

    // Fluent's MessageBar delay-renders its children, so this stays a findBy.
    expect(
      await screen.findByText(/1 step would change this site/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark applied" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onMarkApplied).toHaveBeenCalledTimes(1);
  });

  it("does not mark applied when the confirm is declined", () => {
    const onMarkApplied = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={someAbsent}
        onDismiss={() => {}}
        onMarkApplied={onMarkApplied}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark applied" }));
    expect(onMarkApplied).not.toHaveBeenCalled();
  });

  it("offers no Apply action when the panel is given none", () => {
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={someAbsent}
        onDismiss={() => {}}
        onMarkApplied={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Apply m1" }),
    ).not.toBeInTheDocument();
  });

  it("applies without a confirmation prompt, even for steps that would change the site", () => {
    const onApply = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={someAbsent}
        onDismiss={() => {}}
        onApply={onApply}
        onMarkApplied={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply m1" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("offers Apply on its own when the runner cannot mark applied", () => {
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={someAbsent}
        onDismiss={() => {}}
        onApply={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Apply m1" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark applied" }),
    ).not.toBeInTheDocument();
  });

  it("counts only the previewed migration when the plan spans several", async () => {
    // Mark applied records m1 alone, so another migration's absent step must not warn.
    const spanning: MigrationsPlan = {
      direction: "up",
      steps: [
        ...allPresent.steps,
        {
          migrationId: "m0",
          direction: "up",
          summary: 'Add field Other (Text) to "Z"',
          willRun: true,
          destructive: false,
          presence: "absent",
          opaque: false,
        },
      ],
    };
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={spanning}
        onDismiss={() => {}}
        onMarkApplied={() => {}}
      />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("counts unverifiable steps as changes, since they cannot be checked", async () => {
    const withRun: MigrationsPlan = {
      direction: "up",
      steps: [
        ...allPresent.steps,
        {
          migrationId: "m1",
          direction: "up",
          summary: "backfill",
          willRun: true,
          destructive: false,
          presence: "unknown",
          opaque: true,
        },
      ],
    };
    skin(
      <MigrationPreviewPanel
        migrationId="m1"
        plan={withRun}
        onDismiss={() => {}}
        onMarkApplied={() => {}}
      />,
    );
    expect(
      await screen.findByText(/1 step would change this site/),
    ).toBeInTheDocument();
  });
});
