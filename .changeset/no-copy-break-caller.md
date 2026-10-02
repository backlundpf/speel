---
"@speel/identity": patch
---

`applySecurables` now leaves a newly broken securable holding exactly what the plan grants. A no-copy break makes SharePoint give the calling user Full Control, which the apply never revoked. It now revokes that assignment in one follow-up save after the grants, unless the plan grants the caller that role. The caller and the Full Control role (found by role type, so localised names work) are resolved once per apply, before anything is sent. A securable whose own operations did not all land keeps the caller's assignment, so a re-run can still converge it.
