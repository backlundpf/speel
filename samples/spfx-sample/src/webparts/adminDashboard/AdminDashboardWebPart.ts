import * as React from "react";
import * as ReactDom from "react-dom";
import { Version } from "@microsoft/sp-core-library";
import { type IPropertyPaneConfiguration } from "@microsoft/sp-property-pane";
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";

import { initSpeelDbContext } from "@speel/core";
import { initSpeelIdentity } from "@speel/identity";
import { useSharePointIdentity } from "@speel/pnpjs";
import type { Migrator } from "@speel/migrations";
import { ProjectDashboardContext } from "../../speel/ProjectDashboardContext";
import { buildActions, exposeOnWindow } from "./speel/actions";
import { buildMigrator, buildMigrations } from "./speel/migrations";
import { buildSeed } from "./speel/seed";
import { buildConformance } from "./speel/conformance";
import { AdminDashboard } from "./components/AdminDashboard";

export default class AdminDashboardWebPart extends BaseClientSideWebPart<
  Record<string, never>
> {
  private _speelCtx?: ProjectDashboardContext;
  private _migrator?: Migrator;

  public render(): void {
    ReactDom.render(
      React.createElement(AdminDashboard, { migrator: this._migrator }),
      this.domElement,
    );
  }

  protected onInit(): Promise<void> {
    this._initSpeel();
    return Promise.resolve();
  }

  // Schema migrations UI + the demo console helpers (window.pd actions / seed /
  // migrations). Failures are caught so a broken model doesn't take the web part
  // down — the React tree still renders.
  private _initSpeel(): void {
    try {
      const ctx = initSpeelDbContext(ProjectDashboardContext, (b) =>
        b.useSharePoint(this.context),
      );
      // Identity is a sibling of the data context: permission writes stage on its
      // queue and flush through identity.saveChangesAsync().
      const identity = initSpeelIdentity(ctx, (b) =>
        b.useProvider(useSharePointIdentity(this.context)),
      );
      const actions = buildActions(ctx, identity);
      exposeOnWindow(ctx, actions);
      const migrator = buildMigrator(ctx, this.context);
      this._migrator = migrator;
      if (typeof window !== "undefined" && window.pd) {
        window.pd.migrations = buildMigrations(migrator);
        window.pd.seed = buildSeed(ctx, identity, this.context);
        window.pd.conformance = buildConformance(
          ctx,
          this.context.pageContext.web.absoluteUrl,
        );
        console.log(
          "  window.pd.migrations  — status() | up() | to(id)  (schema provisioning)",
        );
        console.log(
          "  window.pd.seed()      — create demo Programs / Tags / Projects",
        );
        console.log(
          "  window.pd.conformance.run() — provider conformance suite, live",
        );
      }
      this._speelCtx = ctx;
      void actions.runAll();
    } catch (err) {
      console.error("[speel] admin init failed:", err);
    }
  }

  protected onDispose(): void {
    this._speelCtx?.dispose();
    this._speelCtx = undefined;
    if (typeof window !== "undefined") {
      delete window.pd;
    }
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse("1.0");
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return { pages: [] };
  }
}
