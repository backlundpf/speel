// Stand-in for the SharePoint URL field shape ({ Url, Description }).
// speel-core has no first-class URL field type yet (deferred to a later
// slice); we treat it as an opaque string so the model still loads. The
// underlying SP column should be a Text column for the round-trip to work.
export type UrlValue = string;
