import { describe, it, expect, beforeEach } from "vitest";
import {
  subscribeToUrl,
  getUrlSnapshot,
  writeUrlParams,
  __resetUrlStoreForTests,
} from "../src/url/urlStore.js";

beforeEach(() => {
  window.history.replaceState(null, "", "/page");
  __resetUrlStoreForTests();
});

describe("url store", () => {
  it("reports the current search string as its snapshot", () => {
    window.history.replaceState(null, "", "/page?a=1");
    __resetUrlStoreForTests();
    expect(getUrlSnapshot()).toBe("?a=1");
  });

  it("writes a key and notifies subscribers", () => {
    let calls = 0;
    subscribeToUrl(() => {
      calls += 1;
    });
    writeUrlParams([["resnum", "R-1"]], "replace");
    expect(window.location.search).toContain("resnum=R-1");
    expect(getUrlSnapshot()).toContain("resnum=R-1");
    expect(calls).toBe(1);
  });

  it("removes a key when its value is null", () => {
    writeUrlParams([["resnum", "R-1"]], "replace");
    writeUrlParams([["resnum", null]], "replace");
    expect(window.location.search).not.toContain("resnum");
  });

  it("leaves foreign keys alone", () => {
    window.history.replaceState(null, "", "/page?env=prod&other=keep");
    __resetUrlStoreForTests();
    writeUrlParams([["resnum", "R-1"]], "replace");
    expect(window.location.search).toContain("env=prod");
    expect(window.location.search).toContain("other=keep");
    expect(window.location.search).toContain("resnum=R-1");
  });

  it("push adds a history entry and replace does not", () => {
    const before = window.history.length;
    writeUrlParams([["resnum", "R-1"]], "replace");
    expect(window.history.length).toBe(before);
    writeUrlParams([["resnum", "R-2"]], "push");
    expect(window.history.length).toBe(before + 1);
  });

  it("re-reads and notifies on popstate", () => {
    let calls = 0;
    subscribeToUrl(() => {
      calls += 1;
    });
    window.history.replaceState(null, "", "/page?resnum=R-9");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(getUrlSnapshot()).toContain("resnum=R-9");
    expect(calls).toBe(1);
  });

  it("stops notifying after unsubscribe", () => {
    let calls = 0;
    const unsubscribe = subscribeToUrl(() => {
      calls += 1;
    });
    unsubscribe();
    writeUrlParams([["resnum", "R-1"]], "replace");
    expect(calls).toBe(0);
  });

  it("does not notify when a write changes nothing", () => {
    writeUrlParams([["resnum", "R-1"]], "replace");
    let calls = 0;
    subscribeToUrl(() => {
      calls += 1;
    });
    writeUrlParams([["resnum", "R-1"]], "replace");
    expect(calls).toBe(0);
  });
});
