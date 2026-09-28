// packages/speel-core/test/unit/smoke.test.ts
import { describe, it, expect } from "vitest";
import {
  DbContext,
  DbSet,
  ModelBuilder,
  EntityState,
  initSpeelDbContext,
} from "../../src/index.js";

describe("smoke", () => {
  it("top-level exports load", () => {
    expect(typeof DbContext).toBe("function");
    expect(typeof DbSet).toBe("function");
    expect(typeof ModelBuilder).toBe("function");
    expect(typeof initSpeelDbContext).toBe("function");
    expect(EntityState.Added).toBe("Added");
  });
});
