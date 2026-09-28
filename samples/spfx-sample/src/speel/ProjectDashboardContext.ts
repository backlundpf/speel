import {
  ModelBuilder,
  searchesDisplayField,
  createsByDisplayField,
} from "@speel/core";
import type { FieldContext, OptionContext } from "@speel/core";
import { IdentityDbContext, Principal } from "@speel/identity";
// The model file importing the framework is an accepted trade here: it lets
// this one nav demonstrate createsByForm()'s form-based creator alongside
// createsByDisplayField()'s exact-match-or-insert creator on Tags.
import { createsByForm } from "@speel/react";

import { Project, type CategoryOption } from "../entities/Project";
import { Programs } from "../entities/Programs";
import { Tags } from "../entities/Tags";
import { Customer } from "../entities/Customer";
import { ProjectArtifact } from "../entities/ProjectArtifact";
import { Tasks } from "../entities/Tasks";
import { TaskComment } from "../entities/TaskComment";

// DbContext for the Project Dashboard. Maps the three user-defined entity
// classes (Project, Programs, Tags) to their SharePoint lists, declares
// every field per the comment-driven metadata on Project.ts, and pairs the
// FK columns with their navigation properties.
//
// Note on metadata coverage:
//   * Title.regex, Budget.validation, Reviewers.enabled — covered via hasValidation / isEnabled.
//   * RepoUrl URL shape — URL field type is deferred to a later slice;
//                         stored as Text on the SP side.

// Object-valued choice options for Project.Category. The model value is the
// whole option object; .hasCodec persists/loads the option `id`.
const CATEGORY_OPTIONS: CategoryOption[] = [
  { id: "eng", label: "Engineering" },
  { id: "ops", label: "Operations" },
  { id: "mkt", label: "Marketing" },
];

/** Plain string choices for Project.Labels (multi-value). */
const PROJECT_LABELS = ["Compliance", "Security", "Finance", "HR"];

// IdentityDbContext rather than plain DbContext: it registers the securable snapshot
// (demo 11's .expand(p => p.RoleAssignments)) and brings identity's UserSetting list.
export class ProjectDashboardContext extends IdentityDbContext {
  public projects = this.set(Project);
  public programs = this.set(Programs);
  public tags = this.set(Tags);
  public customers = this.set(Customer);
  public artifacts = this.set(ProjectArtifact);
  // Decorator-defined entity — no onModelCreating block needed.
  public tasks = this.set(Tasks);
  public taskComments = this.set(TaskComment);

  protected onModelCreating(builder: ModelBuilder): void {
    super.onModelCreating(builder); // registers the securable snapshot expand
    builder.entity(Programs, (b) => {
      b.toList("Programs");
      b.property((e) => e.Title)
        .isText()
        .isRequired()
        .hasDisplayName("Title");

      // Reference nav; the FK is inferred as CustomerId. Description is a
      // relationship refinement (now available on the full field surface).
      b.hasOne(Customer, (e) => e.Customer)
        .withMany()
        .hasDescription("Owning customer");

      // Inverse collection, display-only; FK is Project.ProgramId, inferred from
      // the withOne(p => p.Program) inverse nav. isReadOnly affects only this nav,
      // not the shared ProgramId column that Project.Program writes through.
      b.hasMany(Project, (e) => e.OwnedProjects)
        .withOne((p) => p.Program)
        .isReadOnly();
    });

    builder.entity(Customer, (b) => {
      b.toList("Customers");
      b.property((e) => e.Title)
        .isText()
        .isRequired()
        .hasDisplayName("Title");
      b.property((e) => e.ContactName)
        .isText()
        .hasDisplayName("Contact Name");
    });

    builder.entity(Tags, (b) => {
      b.toList("Tags");
      b.property((e) => e.Title)
        .isText()
        .isRequired()
        .hasDisplayName("Title");
    });

    builder.entity(ProjectArtifact, (b) => {
      b.toList("ProjectArtifacts", { template: "documentLibrary" });
      b.property((e) => e.Title)
        .isText()
        .isRequired()
        .hasMaxLength(255);
      b.property((e) => e.Notes)
        .isNote()
        .hasDisplayName("Notes")
        .hasColumnName("Notes0");
      // Surfaced FileDirRef → the document form shows a create-mode Folder input
      // whose value is consumed as the folder placement (never written as a column).
      b.property((e) => e.FileDirRef)
        .isText()
        .hasDisplayName("Folder");
      b.hasOne(Project, (e) => e.Project).withMany();
    });

    builder.entity(Project, (b) => {
      b.toList("Projects");

      // Title — regex enforced via hasValidation.
      b.property((e) => e.Title)
        .isText()
        .isRequired()
        .hasMaxLength(80)
        .hasDisplayName("Title")
        .hasValidation(
          (c) => /^[\w\s-]+$/.test(String(c.value ?? "")),
          "Letters, numbers, spaces, hyphens only.",
        );

      b.property((e) => e.Status)
        .isChoice()
        .hasOptions(["Planning", "Active", "On Hold", "Complete"])
        .isRequired()
        .hasDisplayName("Status")
        .useTableFilter({ kind: "select", multi: true });

      b.property((e) => e.Priority)
        .isChoice()
        .hasOptions(["Low", "Medium", "High", "Critical"])
        .isRequired()
        .hasDisplayName("Priority");

      // Budget — required when Priority is High or Critical (conditional
      // isRequired predicate, evaluated by the presentation layer).
      b.property((e) => e.Budget)
        .isCurrency()
        .hasCurrencyCode("USD")
        .hasMin(0)
        .isRequired(
          (c: FieldContext<Project>) =>
            c.values.Priority === "High" || c.values.Priority === "Critical",
        )
        .hasDisplayName("Budget")
        .hasValidation(
          (c) => c.value == null || (c.value as number) >= 0,
          "Budget cannot be negative.",
        );

      b.property((e) => e.DueDate)
        .isDateTime()
        .asDateOnly()
        .isRequired()
        .hasDisplayName("Due Date")
        .useTableFilter({
          kind: "dateRange",
          presets: ["thisFiscalQuarter", "thisFiscalYear", "last30Days"],
        });

      b.property((e) => e.StartDate)
        .isDateTime()
        .asDateOnly()
        .hasDisplayName("Start Date");

      b.property((e) => e.IsPublic)
        .isBoolean()
        .hasDisplayName("Public");

      b.property((e) => e.Description)
        .isNote()
        .hasDisplayName("Description");

      // RepoUrl — UrlValue is aliased to string; speel-core has no URL field
      // type yet, so the underlying SP column should be a Text column.
      b.property((e) => e.RepoUrl)
        .isText()
        .hasDisplayName("Repository URL");

      // Category — object-valued choice. hasOptions/hasOptionsValue/
      // hasOptionsRender are presentation-only metadata (the entity property
      // holds the whole option object); hasCodec's provider pair persists it as
      // the SP Choice scalar (the option id) and rebuilds the object on read.
      b.property((e) => e.Category)
        .isChoice()
        .hasOptions(CATEGORY_OPTIONS)
        .hasOptionsValue((o) => o.id)
        .hasOptionsRender((o) => o.label)
        // State-dependent availability: "Marketing" is only offered on public projects.
        .hasOptionsFilter(
          (c: OptionContext<Project>) =>
            (c.option as CategoryOption).id !== "mkt" || !!c.values.IsPublic,
        )
        .hasCodec<CategoryOption, string>({
          toProvider: (o) => o.id,
          fromProvider: (s) => CATEGORY_OPTIONS.find((o) => o.id === s)!,
        })
        .hasDisplayName("Category");

      // Labels — plain multi-value choice. The entity holds a string[]; SharePoint
      // stores an SPFieldMultiChoiceValue, so no conversion is needed either way.
      b.property((e) => e.Labels)
        .isMultiChoice()
        .hasOptions(PROJECT_LABELS)
        .hasDisplayName("Labels");

      // Relationships own their FK columns: the lookup columns (OwnerId,
      // ReviewersId, ProgramId, TagsId) are synthesized from these declarations
      // and still materialize as number | number[] when the nav isn't expanded.
      // Principal is declared as a set by IdentityDbContext, so hasOne/hasMany
      // resolve it without an explicit builder.entity(Principal, ...) call.
      b.hasOne(Principal, (e) => e.Owner)
        .withMany()
        .hasForeignKey((e) => e.OwnerId)
        .hasDisplayName("Owner");
      b.hasMany(Principal, (e) => e.Reviewers)
        .withMany()
        .hasForeignKey((e) => e.ReviewersId)
        .hasDisplayName("Reviewers")
        .isEnabled((c: FieldContext<Project>) => c.values.Owner != null);
      // Every lookup renders as the combobox now; `hasOptionsQueryAsync` is the
      // opt-in to search at the SOURCE instead of loading the target once. This
      // is the one sample lookup that does — the dashboard's create/edit form is
      // a Project form, so it is the one field in the sample that shows it.
      b.hasOne(Programs, (e) => e.Program)
        .withMany((p) => p.OwnedProjects)
        .isRequired(true)
        .hasOptionsQueryAsync(searchesDisplayField())
        // Demonstrates createsByForm(): a typed Program with no exact match
        // opens a create form instead of inserting blind, so the rest of the
        // row (beyond the display field) can be filled in before it saves.
        .hasOptionsCreateAsync(createsByForm())
        .hasDisplayName("Program");
      // Demonstrates createsByDisplayField(): the stock exact-match-or-insert
      // creator, on a multi-value lookup — a typed Tag with no match is
      // inserted with just its display field and picked up immediately.
      b.hasMany(Tags, (e) => e.Tags)
        .withMany()
        .hasForeignKey((e) => e.TagsId)
        .hasDisplayName("Tags")
        .hasOptionsCreateAsync(createsByDisplayField());

      b.hasValidation(
        (c) => c.values.Status !== "Complete" || c.values.Budget != null,
        "A completed project must record a budget.",
      );

      // Opt Projects into list caching. The cached shape selects all columns
      // plus an expanded Owner (so cacheAsync() returns the person without a
      // second round-trip). A 30s TTL means repeated cacheAsync() calls inside
      // the window serve straight from the cache; saveChangesAsync() on a
      // Project marks the cache stale so the next call re-syncs the delta.
      b.useCaching((c) => c.withTimeout(30_000).expand((e) => e.Owner));
    });
  }
}
