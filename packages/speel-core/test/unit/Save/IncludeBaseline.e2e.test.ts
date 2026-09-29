// A navigation an `include()` just populated IS the parent's original state. The parent's
// snapshot is taken when it is materialized — QueryExecutor tracks before includes resolve
// — or refreshed when it was last flushed, so without recording the loaded membership the
// tracker believes the collection was empty all along. Two consequences, both live:
//
//   * every loaded child reads as newly ADDED on the next save (invisible while it works,
//     because re-writing a child's FK to the value it already holds is not a dirty column),
//     and once such a child is deleted the phantom add fetches a row that is gone:
//     "AuditResponse #2441 not found for inverse fixup" — a teardown that could not finish,
//     leaving orphaned rows behind on the tenant;
//   * nothing can ever read as REMOVED, so detaching an include-loaded child silently did
//     nothing at all.
//
// The explicit-loading path has recorded this baseline since markNavLoaded landed
// (see ChangeTracker/ExplicitLoading.e2e.test.ts); the include path had not.
import { it, expect } from "vitest";
import {
  DbContext,
  ModelBuilder,
  initSpeelDbContext,
} from "../../../src/index.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";

class AuditRequest {
  Id?: number;
  Title: string | null = null;
  Responses: AuditResponse[] | null = null;
}
class AuditResponse {
  Id?: number;
  Title: string | null = null;
  ReqNum: AuditRequest | null = null;
  ReqNumId: number | null = null;
  ResponseDocs: AuditResponseDoc[] | null = null;
}
class AuditResponseDoc {
  Id?: number;
  Title: string | null = null;
  Response: AuditResponse | null = null;
  ResponseId: number | null = null;
}

class AuditCtx extends DbContext {
  public auditRequests = this.set(AuditRequest);
  public auditResponses = this.set(AuditResponse);
  public auditResponseDocs = this.set(AuditResponseDoc);
  protected override onModelCreating(b: ModelBuilder): void {
    b.entity(AuditRequest, (e) => {
      e.toList("AuditRequests");
      e.property((x) => x.Title).isText();
      e.hasMany(AuditResponse, (x) => x.Responses).withOne((r) => r.ReqNum);
    });
    b.entity(AuditResponse, (e) => {
      e.toList("AuditResponses");
      e.property((x) => x.Title).isText();
      e.hasOne(AuditRequest, (x) => x.ReqNum).withMany((r) => r.Responses);
      e.hasMany(AuditResponseDoc, (x) => x.ResponseDocs).withOne(
        (d) => d.Response,
      );
    });
    b.entity(AuditResponseDoc, (e) => {
      e.toList("AuditResponseDocs");
      e.property((x) => x.Title).isText();
      e.hasOne(AuditResponse, (x) => x.Response).withMany(
        (r) => r.ResponseDocs,
      );
    });
  }
}

const requestsList: IListHandle = { kind: "title", value: "AuditRequests" };
const responsesList: IListHandle = { kind: "title", value: "AuditResponses" };
const docsList: IListHandle = { kind: "title", value: "AuditResponseDocs" };

it("REGRESSION: the live teardown — create, eager-load, then delete child rows and the parent", async () => {
  // One long-lived context, each step its own save, exactly as the integration test ran.
  const provider = new FakeStorageProvider();
  const ctx = initSpeelDbContext(AuditCtx, (b) => b.useProvider(provider));

  const request = Object.assign(new AuditRequest(), { Title: "REQ-1" });
  ctx.auditRequests.add(request);
  await ctx.saveChangesAsync();

  // The child is created by FK scalar; its ReqNum navigation is never assigned.
  const response = Object.assign(new AuditResponse(), {
    Title: "RESP-1",
    ReqNumId: request.Id!,
  });
  ctx.auditResponses.add(response);
  await ctx.saveChangesAsync();
  const responseId = response.Id!;

  // The dashboard's eager load repopulates the ALREADY-TRACKED request's collection.
  const dashboard = await ctx.auditRequests
    .where((b) => b.Title.eq("REQ-1"))
    .include((r) => r.Responses)
    .thenInclude((r) => r.ResponseDocs)
    .toArrayAsync();
  expect(dashboard[0]).toBe(request); // identity map, not a copy
  expect(request.Responses?.map((r) => r.Id)).toEqual([responseId]);

  const doc = Object.assign(new AuditResponseDoc(), {
    Title: "DOC-1",
    ResponseId: responseId,
  });
  ctx.auditResponseDocs.add(doc);
  await ctx.saveChangesAsync();
  const docId = doc.Id!;

  ctx.auditResponseDocs.remove(doc);
  await ctx.saveChangesAsync();

  const found = await ctx.auditResponses.findAsync(responseId);
  ctx.auditResponses.remove(found!);
  await ctx.saveChangesAsync(); // threw here, live

  ctx.auditRequests.remove(request);
  await ctx.saveChangesAsync();

  // Teardown completed — no orphaned rows left behind.
  expect(await provider.getItemByIdAsync(docsList, docId, ["Id"])).toBeNull();
  expect(
    await provider.getItemByIdAsync(responsesList, responseId, ["Id"]),
  ).toBeNull();
  expect(
    await provider.getItemByIdAsync(requestsList, request.Id!, ["Id"]),
  ).toBeNull();
});

it("REGRESSION: detaching a child from an include-loaded collection nulls its FK", async () => {
  // The mirror image of the same missing baseline: with the original set empty, no member
  // could ever be outside it, so the detach was silently dropped.
  const provider = new FakeStorageProvider();
  provider.seedRow(requestsList, { Title: "REQ-1" });
  provider.seedRow(responsesList, { Title: "Keep", ReqNumId: 1 });
  provider.seedRow(responsesList, { Title: "Drop", ReqNumId: 1 });
  const ctx = initSpeelDbContext(AuditCtx, (b) => b.useProvider(provider));

  const [request] = await ctx.auditRequests
    .include((r) => r.Responses)
    .toArrayAsync();
  const kept = request!.Responses!.find((r) => r.Title === "Keep")!;
  const dropped = request!.Responses!.find((r) => r.Title === "Drop")!;
  const keptSeqBefore = provider.modificationCountFor(responsesList, kept.Id!);

  request!.Responses = [kept];
  await ctx.saveChangesAsync();

  expect(dropped.ReqNumId).toBeNull();
  const saved = await provider.getItemsByIdsAsync(
    responsesList,
    [dropped.Id!],
    ["ReqNumId"],
  );
  expect(
    (saved[0] as { ReqNumId?: number | null }).ReqNumId ?? null,
  ).toBeNull();
  // ...and the member that stayed was never re-written.
  expect(provider.modificationCountFor(responsesList, kept.Id!)).toBe(
    keptSeqBefore,
  );
});
