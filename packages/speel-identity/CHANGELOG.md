# @speel/identity

## 0.1.0-beta.3

### Patch Changes

- Updated dependencies [74d9aea]
- Updated dependencies [1f75380]
- Updated dependencies [7e20c89]
  - @speel/core@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- 9472f21: `applySecurables` now leaves a newly broken securable holding exactly what the plan grants. A no-copy break makes SharePoint give the calling user Full Control, which the apply never revoked. It now revokes that assignment in one follow-up save after the grants, unless the plan grants the caller that role. The caller and the Full Control role (found by role type, so localised names work) are resolved once per apply, before anything is sent. A securable whose own operations did not all land keeps the caller's assignment, so a re-run can still converge it.
- Updated dependencies [eed7911]
- Updated dependencies [eed7911]
  - @speel/core@0.1.0-beta.2
