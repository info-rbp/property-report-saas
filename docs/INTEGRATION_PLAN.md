# Upstream integration decision record

Pinned original engine: `info-rbp/Property-Report-Tool` commit `ed55b4409d7caf668b4cb62c8a27fc79a8d2ce68`.

The SaaS uses the visual editors, catalogue and deterministic renderer, adapted at build time. Original API, authentication, IndexedDB cache, production configuration and ProInspect platform publication are not reused.

| Upstream work | SaaS decision |
|---|---|
| PR16 hardening, head `3b13f4d7f0fcb63a739fde592a58fc7a64d0b2a7` | Reviewed requirements. Workspace-scoped replacements implement CAS, immutable corrections, roles, mirrors, conflict export, dated caches and storage validation. No blanket merge of single-business authorisation. Local conflicting work is downloadable with pending photographs; the user must deliberately reconcile it, not silently overwrite cloud data. |
| PR17 monthly inline photos and ordering | Actual pinned main already contains monthly/updated-management inline evidence and item ordering despite the PR remaining open. Retained the current source, added 13-photo regression, did not overwrite it with the older branch. |
| PR41/issue42 ProInspect platform publication | Operational ProInspect handoff/publication is deliberately excluded from independent SaaS; legacy publication returns 410. Any future integration requires workspace-bound credentials, signed user/context, review gate and new acceptance tests. |

The original repository was not merged, modified or deployed. A PR's open/closed state alone is not evidence that a feature is absent; actual pinned source determines what is imported.
