import { describe, it, expect } from "vitest";
import * as api from "../src/index.js";

describe("@speel/react surface exports", () => {
  it("exposes the imperative surface API", () => {
    expect(typeof api.useSurfaces).toBe("function");
    expect(typeof api.useOverlays).toBe("function");
  });
});
