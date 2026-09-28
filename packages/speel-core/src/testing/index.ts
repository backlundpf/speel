// FakeStorageProvider: the in-memory provider for tests and demos — implements
// all three parts of the contract (IStorageProvider, IFileSystem, IChangeFeed)
// — the same fake the @speel/core unit suite runs against.
export { FakeStorageProvider } from "./FakeStorageProvider.js";
/** @deprecated Renamed FakeStorageProvider — the fake implements the whole three-part contract, not a SharePoint. */
export { FakeStorageProvider as FakeSharePointProvider } from "./FakeStorageProvider.js";
export type { IFakePrincipal } from "./FakeStorageProvider.js";
// The provider conformance suite — harness-driven, vitest-free, so
// the same cases run against the fake in a unit run and against the live
// provider inside a browser page.
export {
  providerConformanceCases,
  type IProviderConformanceHarness,
  type IConformanceCase,
  type IConformancePrincipal,
} from "./conformance/providerConformance.js";
// Property factories: the model's own field description for a write or a typed
// read, without building a whole model.
export {
  textProperty,
  numberProperty,
  booleanProperty,
  dateTimeProperty,
  choiceProperty,
  lookupProperty,
  stubEntityType,
} from "./properties.js";
