import type { Principal } from "@speel/core";

export class Program {
  Id?: number;
  Title?: string;
}

export class Project {
  Id?: number;
  Title?: string;
  Status?: string;
  Budget?: number;
  DueDate?: Date;
  IsPublic?: boolean;
  Description?: string;
  OwnerId?: number | null;
  Owner?: Principal | null;
  ReviewersId?: number[];
  Reviewers?: Principal[];
  ProgramId?: number | null;
  Program?: Program | null;
}
