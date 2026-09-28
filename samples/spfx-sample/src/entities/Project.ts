import { SpeelEntity } from "@speel/core";
import { Principal } from "@speel/identity";
import type { UrlValue } from "./types";
import { Programs } from "./Programs";
import { Tags } from "./Tags";

/**
 * Object-valued choice option for the Category field. The entity holds this
 * whole object; SharePoint stores `id` (mapped via .hasCodec in the context).
 */
export interface CategoryOption {
  id: string;
  label: string;
}

// { list: "Projects" }
export class Project extends SpeelEntity {
  // { displayName: "Title", required: true, maxLength: 80, regex: /^[\w\s-]+$/ }
  public Title: string | null = null;

  // { displayName: "Status", choices: ["Planning","Active","On Hold","Complete"], required: true }
  public Status: "Planning" | "Active" | "On Hold" | "Complete" | null = null;

  // { displayName: "Priority", choices: ["Low","Medium","High","Critical"], required: true }
  public Priority: "Low" | "Medium" | "High" | "Critical" | null = null;

  // { displayName: "Budget", currencyCode: "USD", min: 0, required when Priority High/Critical }
  public Budget: number | null = null;

  // { displayName: "Due Date", required: true, includeTime: false }
  public DueDate: Date | null = null;

  // { displayName: "Start Date", includeTime: false }
  public StartDate: Date | null = null;

  // { displayName: "Owner", required: true }
  public Owner: Principal | null = null;

  // { displayName: "Reviewers", multi: true, enabled when Owner set }
  public Reviewers: Principal[] | null = null;

  // { displayName: "Repository URL" }
  public RepoUrl: UrlValue | null = null;

  // { displayName: "Public" }
  public IsPublic: boolean | null = null;

  // { displayName: "Description", maxLength: 2000 }
  public Description: string | null = null;

  // { displayName: "Category" — object-valued choice; SP stores the option id via .hasCodec }
  public Category: CategoryOption | null = null;

  // { displayName: "Labels", choices: ["Compliance","Security","Finance","HR"], multi: true }
  public Labels: string[] | null = null;

  // { displayName: "Program", target: () => Programs, lookupField: (p) => p.Title }
  public Program: Programs | null = null;

  // { displayName: "Tags", target: () => Tags, lookupField: (p) => p.Title, multi: true }
  public Tags: Tags[] | null = null;

  // FK id columns for the Lookup/User navigations above. speel-core synthesizes
  // these from the hasOne/hasMany relationships in the context; they materialize
  // as number | number[] when the nav isn't expanded.
  public OwnerId: number | null = null;
  public ReviewersId: number[] | null = null;
  public ProgramId: number | null = null;
  public TagsId: number[] | null = null;
}
