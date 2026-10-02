---
"@speel/pnpjs": minor
---

People search can use Microsoft Graph as a second source. Pass `graph` (any function that performs a Graph GET and returns the JSON body, such as an `MSGraphClientV3` adapter) to `useSharePointIdentity` or `new SharePointIdentityProvider(sp, { graph })`. `searchPrincipalsAsync` then also finds Entra ID users whose name starts with every typed word in any order ("John Smith", "Smith, John", "Smi Jo"), or whose login or email starts with a single typed word. People-picker results keep their ranking first, Graph results are de-duplicated by login, and `maxResults` applies after the merge. If the Graph call fails, search falls back to the picker. This needs the delegated `User.ReadBasic.All` permission. Without a `graph` source, behaviour is unchanged.
