import type { Page, Locator } from "@playwright/test";
import { loadEnv, type SitePage } from "../helpers/env";

/** XPath string literal (our field labels contain no quotes). */
const xp = (s: string): string => `'${s}'`;

/** Plain, serialisable projection of a Project crossing the evaluate boundary.
 *  (window.pd.ctx returns live entity instances, which can't cross as-is.) */
export interface ProjectRow {
  Id: number;
  Title: string;
  Status: string;
}

/** What the smoke test watches for in the browser console. Attach BEFORE open(). */
export interface ConsoleWatch {
  /** True once the demo's "Read-only demo complete." banner is logged. */
  isDemoComplete(): boolean;
  /** Any [speel] error lines captured. */
  errors(): string[];
}

/**
 * Page Object for the SPFx sample web part pages (see SitePage); open() picks one.
 * Handles the debug-bundle loading specific to local SPFx serve, then exposes
 * the demo surface the web part publishes on `window.pd`.
 */
export class ProjectDashboardPage {
  constructor(private readonly page: Page) {}

  /** Start capturing the web part's console output. Call before {@link open}
   *  so the auto-run `runAll()` banner/errors aren't missed. */
  watchConsole(): ConsoleWatch {
    const errors: string[] = [];
    let demoComplete = false;
    this.page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("Read-only demo complete.")) demoComplete = true;
      if (text.includes("[speel] runAll error:")) errors.push(text);
      else if (msg.type() === "error" && text.includes("[speel]"))
        errors.push(text);
    });
    return { isDemoComplete: () => demoComplete, errors: () => errors };
  }

  /** Navigate to one web part's page with debug scripts pointing at the local
   *  serve, accept the debug-scripts prompt, and wait for the web part to mount.
   *  Only the admin page publishes `window.pd`, so that is what it waits for
   *  there; the project page is ready once its "New project" button renders. */
  async open(
    site: SitePage = "project",
    opts: { skin?: "fluent" | "shadcn" } = {},
  ): Promise<void> {
    const env = loadEnv();
    // The project dashboard reads its skin from `?skin=`; Fluent is the bare URL.
    const skin =
      opts.skin && opts.skin !== "fluent" ? `&skin=${opts.skin}` : "";
    const url =
      `${env.pages[site]}?debugManifestsFile=${encodeURIComponent(env.manifestUrl)}` +
      `&loadSPFX=true&debug=true&noredir=true${skin}`;
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    await this.loadDebugScripts();
    if (site === "admin") await this.waitForSpeelReady();
    else if (site === "project") await this.waitForProjectPage();
  }

  /** Resolve once the project page's web part has mounted (its "New project"
   *  button renders). The project page publishes no `window.pd`. */
  async waitForProjectPage(timeout = 90_000): Promise<void> {
    await this.page
      .getByRole("button", { name: "New project", exact: true })
      .waitFor({ timeout });
  }

  /** SharePoint shows a "Load debug scripts" dialog when a page is opened with a
   *  debugManifestsFile pointing at a localhost serve. It renders a few seconds
   *  after navigation, so wait for the button before clicking. No-op if absent. */
  async loadDebugScripts(timeout = 20_000): Promise<void> {
    const button = this.page
      .locator('button, a, [role="button"]')
      .filter({ hasText: /load debug scripts/i })
      .first();

    const appeared = await button
      .waitFor({ state: "visible", timeout })
      .then(() => true)
      .catch(() => false);

    if (appeared) {
      await button.click();
    }
  }

  /** Resolve once the web part has mounted and exposed window.pd (proves
   *  onInit/_initSpeel ran). */
  async waitForSpeelReady(timeout = 90_000): Promise<void> {
    await this.page.waitForFunction(
      () => Boolean((window as { pd?: unknown }).pd),
      undefined,
      {
        timeout,
      },
    );
  }

  /** Read all projects via the live DbContext, projected to plain rows. */
  async readProjects(): Promise<ProjectRow[]> {
    return this.page.evaluate(async () => {
      const pd = (
        window as unknown as {
          pd: { ctx: { projects: { toArrayAsync(): Promise<unknown[]> } } };
        }
      ).pd;
      const projects = await pd.ctx.projects.toArrayAsync();
      return (
        projects as Array<{ Id: number; Title: string; Status: string }>
      ).map((p) => ({
        Id: p.Id,
        Title: p.Title,
        Status: p.Status,
      }));
    });
  }

  /** Count active high-priority projects via the live DbContext (server-side). */
  async countHighPriorityActive(): Promise<number> {
    return this.page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pd = (window as any).pd;
      return pd.ctx.projects
        .where((p: any) => p.Status.eq("Active"))
        .where((p: any) => p.Priority.in(["High", "Critical"]))
        .countAsync();
    });
  }

  // ------------------------------------------------------------------
  // Imperative surfaces (showForm) — drive the @speel/react modal/panel.
  // The Fluent v8 skin renders a centered Dialog (`.ms-Dialog-main`) for
  // `surface:'modal'` and a side Panel (`.ms-Panel-main`) for `surface:'panel'`.
  // Field labels are Fluent <Label>s that sit as a sibling before each control;
  // text and date inputs are located by a label-relative XPath, while selection
  // fields (a Fluent ComboBox) are found by role + accessible name.
  // ------------------------------------------------------------------

  /** The open centered modal's content frame (our flex column filling the Modal main;
   *  its box equals the modal box, so it drives drag/resize/fullscreen measurements). */
  modal(): Locator {
    return this.page.locator(".speel-modal");
  }
  /** The open side panel. */
  panel(): Locator {
    return this.page.locator(".ms-Panel-main");
  }
  /** The modal's sticky title bar (also the drag handle). */
  modalBar(scope: Locator): Locator {
    return scope.locator(".speel-modal-bar");
  }

  async clickNewProject(): Promise<void> {
    await this.page
      .getByRole("button", { name: "New project", exact: true })
      .click();
    await this.modal().waitFor({ state: "visible" });
  }

  /** A section heading (proves FormSection layout) within the given surface. */
  sectionHeading(scope: Locator, title: string): Locator {
    return scope.getByText(title, { exact: true });
  }

  // Modal chrome (V8Dialog custom title bar + resize handle). Scope close/fullscreen
  // to the title bar so they don't collide with a footer "Close" button (view mode).
  fullscreenToggle(scope: Locator): Locator {
    return scope
      .locator(".speel-modal-bar")
      .getByRole("button", { name: "Toggle fullscreen" });
  }
  modalClose(scope: Locator): Locator {
    return scope
      .locator(".speel-modal-bar")
      .getByRole("button", { name: "Close", exact: true });
  }
  resizeHandle(scope: Locator): Locator {
    return scope.locator('[data-testid="resize-handle"]');
  }

  saveButton(scope: Locator): Locator {
    return scope.getByRole("button", { name: "Save", exact: true });
  }
  cancelButton(scope: Locator): Locator {
    return scope.getByRole("button", { name: "Cancel", exact: true });
  }

  /** Text input for a field by its label, scoped to a surface. */
  private textInput(scope: Locator, label: string): Locator {
    return scope.locator(
      `xpath=.//label[normalize-space(.)=${xp(label)}]/following-sibling::div[contains(@class,"ms-TextField")]//input`,
    );
  }
  /** A selection field (Choice, lookup, collection): a Fluent ComboBox whose input
   *  carries the field label as its accessible name. */
  private combobox(scope: Locator, label: string): Locator {
    return scope.getByRole("combobox", { name: label, exact: true });
  }
  /** Fluent DatePicker trigger (combobox nested in the TextField sibling). */
  private dateField(scope: Locator, label: string): Locator {
    return scope.locator(
      `xpath=.//label[normalize-space(.)=${xp(label)}]/following-sibling::div[1]//*[@role="combobox"]`,
    );
  }

  async fillText(scope: Locator, label: string, value: string): Promise<void> {
    await this.textInput(scope, label).fill(value);
  }
  async selectChoice(
    scope: Locator,
    label: string,
    option: string,
  ): Promise<void> {
    // Clicking opens the list and triggers its first options load; the callout is
    // portaled outside the surface, so the option is located page-wide.
    await this.combobox(scope, label).click();
    await this.page.getByRole("option", { name: option, exact: true }).click();
  }
  /** Open the calendar and click a day-of-month (default 15, always in view). */
  async pickDueDate(scope: Locator, day = "15"): Promise<void> {
    await this.dateField(scope, "Due Date").click();
    await this.page
      .locator('button[class*="dayButton"]')
      .filter({ hasText: new RegExp(`^${day}$`) })
      .first()
      .click();
  }

  /** Fill the minimal valid create set (Owner/Budget aren't required for Low priority). */
  async fillValidProject(title: string): Promise<void> {
    const m = this.modal();
    await this.fillText(m, "Title", title);
    await this.selectChoice(m, "Status", "Planning");
    await this.selectChoice(m, "Priority", "Low");
    await this.pickDueDate(m);
  }

  /** A toast message (portaled MessageBar). */
  toast(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }

  /** The clickable title cell (opens the view modal). A Fluent `Link` with an
   *  onClick but no href renders as a <button>, not an <a>. */
  titleLink(title: string): Locator {
    return this.page.getByRole("button", { name: title, exact: true });
  }
  /** A per-row action icon button ('View' | 'Edit' | 'Delete'). */
  rowAction(title: string, action: "View" | "Edit" | "Delete"): Locator {
    return this.page
      .getByRole("row")
      .filter({ hasText: title })
      .getByRole("button", { name: action, exact: true });
  }
}
