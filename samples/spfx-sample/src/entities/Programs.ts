import { SpeelEntity } from "@speel/core";
import { Project } from "./Project";
import { Customer } from "./Customer";

// { list: "Programs" }
export class Programs extends SpeelEntity {
  // { displayName: "Title", required: true }
  public Title: string | null = null;

  public Customer?: Customer;

  public OwnedProjects?: Project[] | null = null;
}
