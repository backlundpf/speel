import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bundle, open } from "./harness";

let js = "";
let css = "";
test.beforeAll(async () => {
  js = await bundle(path.join(__dirname, "shadcnFixture.tsx"));
  css = readFileSync(
    path.resolve(__dirname, "../../lib/styles/speel-shadcn.css"),
    "utf8",
  );
});
const show = (page: Page): Promise<void> => open(page, js, css);
const scenario = (page: Page, name: string): Locator =>
  page.locator(`section[data-scenario="${name}"]`);

test("renders the shadcn table with its styles", async ({ page }) => {
  await show(page);
  const table = scenario(page, "basic").locator("table");
  await expect(table).toBeVisible();
  // Tailwind is applied: the header cells carry the skin's padding (px-2 at the 0.2rem density spacing).
  const padding = await table
    .locator("th")
    .first()
    .evaluate((el) => getComputedStyle(el).paddingLeft);
  expect(padding).toBe("6.4px");
});
