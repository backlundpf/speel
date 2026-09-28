import { Entity, SpeelEntity, TextField } from "@speel/core";

@Entity({ list: "Tags" })
export class Tags extends SpeelEntity {
  @TextField({ displayName: "Title", minLength: 3 })
  public Title: string | null = null;
}
