import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { shadcnAdapter } from "@/speel-shadcn/adapter";

const T = shadcnAdapter.Table;
const items = [{ name: "Bartholomew Longname" }];
const text = (r: unknown): string => (r as { name: string }).name;

describe("shadcn Table column options", () => {
  it("renders headerContent in place of the header, never as a sort button", () => {
    render(
      <T
        columns={[
          {
            key: "s",
            header: "Select",
            sortable: true,
            headerContent: (
              <input type="checkbox" aria-label="Select all" readOnly />
            ),
            render: () => "x",
          },
        ]}
        items={items}
        onSortChange={() => undefined}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Select all" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sortable/ })).toBeNull();
  });

  it("lets a wrap column's cells wrap instead of truncating", () => {
    const { container } = render(
      <T
        columns={[
          { key: "n", header: "N", width: 80, wrap: true, render: text },
        ]}
        items={items}
      />,
    );
    const td = container.querySelector("td")!;
    expect(td.className).toContain("whitespace-normal");
    expect(td.className).not.toContain("truncate");
  });

  it("titles a cut-off cell with its text on hover", () => {
    const { container } = render(
      <T
        columns={[
          { key: "n", header: "N", width: 80, render: text, cellTitle: text },
        ]}
        items={items}
      />,
    );
    const td = container.querySelector("td")!;
    Object.defineProperty(td, "scrollWidth", { value: 200 });
    Object.defineProperty(td, "clientWidth", { value: 80 });
    fireEvent.mouseEnter(td);
    expect(td.title).toBe("Bartholomew Longname");
  });
});
