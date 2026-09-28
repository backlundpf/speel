import * as React from "react";
import * as ReactDom from "react-dom";
import { Version } from "@microsoft/sp-core-library";
import { type IPropertyPaneConfiguration } from "@microsoft/sp-property-pane";
import { BaseClientSideWebPart } from "@microsoft/sp-webpart-base";
import { IReadonlyTheme } from "@microsoft/sp-component-base";

import ProjectDashboard from "./components/ProjectDashboard";
import { IProjectDashboardProps } from "./components/IProjectDashboardProps";
import { initSpeelDbContext, IndexedDbCacheProvider } from "@speel/core";
import "@speel/pnpjs";
import { ProjectDashboardContext } from "../../speel/ProjectDashboardContext";
import { makeGraphPeopleSearch } from "../../speel/graphPeopleSearch";

export default class ProjectDashboardWebPart extends BaseClientSideWebPart<
  Record<string, never>
> {
  private _isDarkTheme: boolean = false;
  private _speelCtx?: ProjectDashboardContext;

  public render(): void {
    const element: React.ReactElement<IProjectDashboardProps> =
      React.createElement(ProjectDashboard, {
        isDarkTheme: this._isDarkTheme,
        speelCtx: this._speelCtx,
        peopleSearch: this._speelCtx
          ? makeGraphPeopleSearch(this.context)
          : undefined,
      });
    ReactDom.render(element, this.domElement);
  }

  protected onInit(): Promise<void> {
    this._initSpeel();
    return Promise.resolve();
  }

  // Initialize the @speel/core DbContext. Migrations + demo console helpers live
  // in the Admin Dashboard web part now. Failures are caught so a broken model or
  // bad SP list shape doesn't take down the web part — the React tree still renders.
  private _initSpeel(): void {
    try {
      this._speelCtx = initSpeelDbContext(ProjectDashboardContext, (b) =>
        b
          .useSharePoint(this.context)
          .useCaching(
            new IndexedDbCacheProvider({ dbName: "speel-project-dashboard" }),
          ),
      );
    } catch (err) {
      console.error("[speel] init failed:", err);
    }
  }

  protected onThemeChanged(currentTheme: IReadonlyTheme | undefined): void {
    if (!currentTheme) return;
    this._isDarkTheme = !!currentTheme.isInverted;
    const { semanticColors } = currentTheme;
    if (semanticColors) {
      this.domElement.style.setProperty(
        "--bodyText",
        semanticColors.bodyText || null,
      );
    }
  }

  protected onDispose(): void {
    this._speelCtx?.dispose();
    this._speelCtx = undefined;
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse("1.0");
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return { pages: [] };
  }
}
