import {
  Entity,
  SpeelEntity,
  TextField,
  NoteField,
  ChoiceField,
  MultiChoiceField,
  NumberField,
  CurrencyField,
  DateTimeField,
  BooleanField,
  Key,
  ManyToOne,
  ManyToMany,
  OneToMany,
} from "@speel/core";
import type { FieldContext } from "@speel/core";
import { Project } from "./Project";
import { Tags } from "./Tags";
import { TaskComment } from "./TaskComment";

// Defined entirely by decorators — no onModelCreating block. `this.set(Tasks)` plus
// the @Entity registration is enough for ModelBuilder to pick it up. Exercises every
// field-type decorator (and the migration utility, via samples' migrations:list).
@Entity({ list: "Tasks" })
export class Tasks extends SpeelEntity {
  @Key public Id?: number = undefined;

  @TextField({ required: true, maxLength: 120, displayName: "Title" })
  public Title: string | null = null;

  @NoteField({ richText: true, displayName: "Details" })
  public Details: string | null = null;

  @ChoiceField({
    options: ["To Do", "In Progress", "Blocked", "Done"],
    radioButtons: true,
    required: true,
    displayName: "Status",
  })
  public Status: "To Do" | "In Progress" | "Blocked" | "Done" | null = null;

  @NumberField({ min: 0, decimalPlaces: 1, displayName: "Estimate (h)" })
  public EstimateHours: number | null = null;

  // Conditional required (predicate) — only required when the task is billable.
  @CurrencyField({
    currencyCode: "USD",
    min: 0,
    displayName: "Cost",
    required: (c: FieldContext<Tasks>) => c.values.IsBillable === true,
  })
  public Cost: number | null = null;

  @DateTimeField({ displayName: "Due Date" })
  public DueDate: Date | null = null;

  @BooleanField({ displayName: "Billable" })
  public IsBillable: boolean | null = null;

  @MultiChoiceField({
    options: ["frontend", "backend", "design", "ops"],
    displayName: "Labels",
  })
  public Labels: string[] | null = null;

  // many-to-one to a FLUENT entity (proves decorator↔fluent relationships); FK on self.
  // Every lookup is the combobox now, so there is nothing to opt into here — note no
  // web part renders a Tasks form, so the control you can actually SEE is
  // Project.Program, declared with `.hasOptionsQueryAsync(searchesDisplayField())`
  // in ProjectDashboardContext.
  @ManyToOne(() => Project, {
    foreignKey: "ProjectId",
    displayName: "Project",
  })
  public Project: Project | null = null;
  public ProjectId: number | null = null;

  @ManyToMany(() => Tags, { foreignKey: "TagsId", displayName: "Tags" })
  public Tags: Tags[] | null = null;
  public TagsId: number[] | null = null;

  // inverse collection; FK lives on TaskComment (the child)
  @OneToMany(() => TaskComment, { inverse: (c) => c.Task })
  public Comments: TaskComment[] | null = null;
}
