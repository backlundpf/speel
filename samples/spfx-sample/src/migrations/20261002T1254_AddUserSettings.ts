import { defineMigration } from "@speel/migrations";

export default defineMigration("20261002T1254_AddUserSettings", {
  up(b) {
    b.createList("Speel User Settings", {
      template: "genericList",
      readSecurity: "own",
      writeSecurity: "own",
    });
    b.addField("Speel User Settings", "Title", (f) =>
      f.text({ displayName: "Title", maxLength: 255 }),
    );
    b.addField("Speel User Settings", "Value", (f) =>
      f.note({
        displayName: "Value",
        richText: false,
        appendOnly: false,
        numberOfLines: 6,
      }),
    );
  },
  down(b) {
    b.dropList("Speel User Settings");
  },
});
