import { defineMigration } from "@speel/migrations";

export default defineMigration("20260609T1631_AddCustomer", {
  up(b) {
    b.createList("Customers", { template: "genericList" });
    b.addField("Customers", "ContactName", (f) =>
      f.text({ displayName: "Contact Name", maxLength: 255 }),
    );
    b.addField("Customers", "Title", (f) =>
      f.text({ displayName: "Title", required: true, maxLength: 255 }),
    );
    b.addField("Programs", "Customer", (f) =>
      f.lookup({
        displayName: "Customer",
        list: "Customers",
        showField: "Title",
        multi: false,
      }),
    );
    b.alterField("Projects", "Program", (f) =>
      f.lookup({
        displayName: "Program",
        required: true,
        list: "Programs",
        showField: "Title",
        multi: false,
      }),
    );
  },
  down(b) {
    b.dropList("Customers");
    b.dropField("Programs", "Customer");
    b.alterField("Projects", "Program", (f) =>
      f.lookup({
        displayName: "Program",
        list: "Programs",
        showField: "Title",
        multi: false,
      }),
    );
  },
});
