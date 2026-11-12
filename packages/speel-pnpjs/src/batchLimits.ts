// src/batchLimits.ts

/**
 * SharePoint caps an OData $batch at 100 sub-requests; a wider level splits
 * across batches. This has to be passed to `sp.batched()` as well as used to
 * chunk our own queue — PnPjs defaults `maxRequests` to 20 and issues one
 * sequential POST per chunk, so omitting it turns a 100-op batch into 5 requests.
 */
export const BATCH_REQUEST_LIMIT = 100;
