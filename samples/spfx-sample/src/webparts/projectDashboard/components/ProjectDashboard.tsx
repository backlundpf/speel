import * as React from "react";
import styles from "./ProjectDashboard.module.scss";
import type { IProjectDashboardProps } from "./IProjectDashboardProps";
import { FluentWrapper } from "./FluentWrapper";
import { ProjectsDashboard } from "./ProjectsDashboard";

export default class ProjectDashboard extends React.Component<IProjectDashboardProps> {
  public render(): React.ReactElement<IProjectDashboardProps> {
    const { isDarkTheme, speelCtx, peopleSearch } = this.props;
    return (
      <section className={styles.projectDashboard}>
        <h2>Project Tracker</h2>
        {speelCtx ? (
          <FluentWrapper isDark={isDarkTheme}>
            <ProjectsDashboard
              ctx={speelCtx}
              {...(peopleSearch ? { peopleSearch } : {})}
            />
          </FluentWrapper>
        ) : (
          <p>Connecting to SharePoint…</p>
        )}
      </section>
    );
  }
}
