import { defineMigration } from "@speel/migrations";

export default defineMigration("20260610T2335_AddProjectArtifacts", {
  up(b) {
    b.createList("ProjectArtifacts", { template: "documentLibrary" });
    // Internal name Notes0: 'Notes' collides with a SharePoint system field on
    // document libraries (SP silently renames on creation; request the real name).
    b.addField("ProjectArtifacts", "Notes0", (f) =>
      f.note({
        displayName: "Notes",
        richText: false,
        appendOnly: false,
        numberOfLines: 6,
      }),
    );
    b.addField("ProjectArtifacts", "Project", (f) =>
      f.lookup({
        displayName: "Project",
        list: "Projects",
        showField: "Title",
        multi: false,
      }),
    );
    b.addField("ProjectArtifacts", "Title", (f) =>
      f.text({ displayName: "Title", required: true, maxLength: 255 }),
    );
  },
  down(b) {
    b.dropList("ProjectArtifacts");
  },
});
