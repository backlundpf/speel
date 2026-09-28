import { DbContext, ModelBuilder, Principal } from "@speel/core";

import { Program, Project } from "./entities";

export class DemoContext extends DbContext {
  public programs = this.set(Program);
  public projects = this.set(Project);

  protected override onModelCreating(builder: ModelBuilder): void {
    builder.entity(Program, (b) => {
      b.toList("Programs");
      b.property((e) => e.Title)
        .isText()
        .isRequired()
        .hasDisplayName("Title");
    });

    builder.entity(Project, (b) => {
      b.toList("Projects");
      b.property((e) => e.Title)
        .isText()
        .isRequired()
        .hasMaxLength(80)
        .hasDisplayName("Title");
      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Planning", "Active", "On Hold", "Complete"])
        .isRequired()
        .hasDisplayName("Status")
        .useTableFilter({ kind: "select", multi: true });
      b.property((e) => e.Budget)
        .isCurrency()
        .hasCurrencyCode("USD")
        .hasMin(0)
        .hasDisplayName("Budget");
      b.property((e) => e.DueDate)
        .isDateTime()
        .asDateOnly()
        .hasDisplayName("Due Date")
        .useTableFilter({
          kind: "dateRange",
          presets: ["last30Days", "thisFiscalQuarter"],
        });
      b.property((e) => e.IsPublic)
        .isBoolean()
        .hasDisplayName("Public");
      b.property((e) => e.Description)
        .isNote()
        .hasDisplayName("Description");
      b.hasOne(Principal, (e) => e.Owner)
        .withMany()
        .hasForeignKey((e) => e.OwnerId)
        .hasDisplayName("Owner");
      b.hasMany(Principal, (e) => e.Reviewers)
        .withMany()
        .hasForeignKey((e) => e.ReviewersId)
        .hasDisplayName("Reviewers");
      b.hasOne(Program, (e) => e.Program)
        .withMany()
        .hasDisplayName("Program");
    });
  }
}
