import { Entity, SpeelEntity, Key, NoteField, ManyToOne } from "@speel/core";
import { Tasks } from "./Tasks";

@Entity({ list: "TaskComments" })
export class TaskComment extends SpeelEntity {
  @Key public Id?: number = undefined;

  // Multi-line note: a comment body can run long, and SharePoint single-line text
  // caps at 255 chars (a single-line @TextField({ maxLength: 500 }) 400s on create).
  @NoteField({ required: true, displayName: "Comment" })
  public Body: string | null = null;

  // many-to-one back to Tasks; FK on self (TaskId). Inverse of Tasks.Comments.
  @ManyToOne(() => Tasks, {
    inverse: (t) => t.Comments,
    foreignKey: "TaskId",
    displayName: "Task",
  })
  public Task: Tasks | null = null;
  public TaskId: number | null = null;
}
