import { describe, it, expect } from "vitest";
import {
  IdentityChangeQueue,
  type IdentityOperation,
} from "../src/IdentityChangeQueue.js";

const member = (group: string): IdentityOperation => ({
  op: "addGroupMember",
  group,
  user: undefined,
});

describe("IdentityChangeQueue.restore", () => {
  it("prepends, so restored ops precede anything staged meanwhile", () => {
    const q = new IdentityChangeQueue();
    q.add(member("A"));
    q.add(member("B"));
    const taken = q.takeAll();
    q.add(member("C")); // staged while the save was in flight
    q.restore(taken);
    expect(q.pending.map((op) => (op as { group: string }).group)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });
});
