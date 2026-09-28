// test/unit/DbContextOptionsBuilder.test.ts
import { describe, it, expect } from "vitest";
import { DbContextOptionsBuilder } from "../../src/DbContextOptionsBuilder.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import { InvalidOperationException } from "../../src/errors.js";
import { InMemoryCacheProvider } from "../../src/Cache/InMemoryCacheProvider.js";

describe("DbContextOptionsBuilder", () => {
  it("options throws when no provider configured", () => {
    const b = new DbContextOptionsBuilder();
    expect(() => b.options).toThrow(InvalidOperationException);
  });

  it("useProvider sets the provider", () => {
    const p = new FakeStorageProvider();
    const b = new DbContextOptionsBuilder().useProvider(p);
    expect(b.options.provider).toBe(p);
  });

  it("useProvider can be called twice (last wins)", () => {
    const p1 = new FakeStorageProvider();
    const p2 = new FakeStorageProvider();
    const b = new DbContextOptionsBuilder().useProvider(p1).useProvider(p2);
    expect(b.options.provider).toBe(p2);
  });
});

describe("DbContextOptionsBuilder.useCaching", () => {
  it("exposes the cache provider on options when configured", () => {
    const b = new DbContextOptionsBuilder();
    const cache = new InMemoryCacheProvider();
    b.useProvider(new FakeStorageProvider());
    b.useCaching(cache);
    expect(b.options.cache).toBe(cache);
  });

  it("leaves options.cache undefined when never called", () => {
    const b = new DbContextOptionsBuilder();
    b.useProvider(new FakeStorageProvider());
    expect(b.options.cache).toBeUndefined();
  });
});
