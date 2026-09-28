import { SpeelDocument } from "@speel/core";
import { Project } from "./Project";

// { list: "ProjectArtifacts" (document library) }
export class ProjectArtifact extends SpeelDocument {
  // { displayName: "Title", required: true, maxLength: 255 }
  public Title: string | null = null;

  // { displayName: "Notes", multiline, column: "Notes0" — 'Notes' collides with a SP system field }
  public Notes: string | null = null;

  // { displayName: "Project" } — FK inferred as ProjectId
  public ProjectId: number | null = null;
  public Project?: Project = undefined;
}
