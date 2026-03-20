# PR Review: Glossary-Based Policy Targeting

![Scope](https://img.shields.io/badge/files-19_changed-blue) ![Lines](https://img.shields.io/badge/lines-+1505_/_--27-brightgreen) ![Findings](https://img.shields.io/badge/findings-7_total-orange) ![Critical](https://img.shields.io/badge/critical-2-red) ![Tests](https://img.shields.io/badge/new_tests-9-green)

## Component Preview

<table>
<tr>
<td><strong>Glossary Browser (focus, no search)</strong></td>
<td><strong>Search Dropdown</strong></td>
<td><strong>Selected Tags</strong></td>
</tr>
<tr>
<td><img src="https://raw.githubusercontent.com/mshuffett/datahub/0274df8a/pr-review-assets/state-a-browser-open.png" width="300"/></td>
<td><img src="https://raw.githubusercontent.com/mshuffett/datahub/0274df8a/pr-review-assets/state-b-search-dropdown.png" width="300"/></td>
<td><img src="https://raw.githubusercontent.com/mshuffett/datahub/0274df8a/pr-review-assets/state-c-tags-selected.png" width="300"/></td>
</tr>
</table>

---

## Findings

### Critical

> [!CAUTION]
> **CSS Syntax Error: Double `}}` breaks styled-component rendering**
>
> [`TermItem.tsx:15`](https://github.com/mshuffett/datahub/blob/9f333f49/datahub-web-react/src/app/glossaryV2/GlossaryBrowser/TermItem.tsx#L15) and [`TermItem.tsx:58`](https://github.com/mshuffett/datahub/blob/9f333f49/datahub-web-react/src/app/glossaryV2/GlossaryBrowser/TermItem.tsx#L58)
>
> Extra `}` after theme interpolation produces invalid CSS (`background-color: #abc123}`) that breaks the entire style block for selected glossary terms.
>
> ```tsx
> // Line 15 — TermWrapper
> background-color: ${(props) => props.$isSelected && props.theme.colors.bgActive}};
> //                                                                              ^^ remove
>
> // Line 58 — TermLink
> color: ${props.theme.colors.textActive}}; font-weight: 700;
> //                                    ^^ remove
> ```

> [!CAUTION]
> **Theme functions render as `[Function]` in plain string template**
>
> [`TermItem.tsx:27-43`](https://github.com/mshuffett/datahub/blob/9f333f49/datahub-web-react/src/app/glossaryV2/GlossaryBrowser/TermItem.tsx#L27)
>
> `nameStyles` is a plain template literal, not a `css` tagged template. Arrow functions like `${(props) => props.theme.colors.text}` are never invoked — they render as their `.toString()` output. All glossary term names will have `color: (props) => props.theme.colors.text` as CSS (invalid, ignored).
>
> **Fix**: Change `const nameStyles = \`` to `const nameStyles = css\`` (import `css` from `styled-components/macro`).

---

### High

> [!WARNING]
> **Feature flag doesn't gate the backend resolver**
>
> [`DefaultEntitySpecResolver.java:29`](https://github.com/mshuffett/datahub/blob/9f333f49/metadata-service/auth-impl/src/main/java/com/datahub/authorization/DefaultEntitySpecResolver.java#L29) and [`FeatureFlags.java:60`](https://github.com/mshuffett/datahub/blob/9f333f49/metadata-service/configuration/src/main/java/com/linkedin/datahub/graphql/featureflags/FeatureFlags.java#L60)
>
> `glossaryBasedPoliciesEnabled` is declared but never checked in the backend. `DefaultEntitySpecResolver` unconditionally registers `GlossaryFieldResolverProvider`. The feature flag only hides the UI — glossary resolution is always active, defeating the purpose of a safe rollout mechanism.
>
> **Fix**: Pass the flag to `DefaultEntitySpecResolver` and conditionally include the provider.

---

### Medium

<details>
<summary><strong>Semantic color token mismatch — <code>borderDisabled</code> used for text</strong></summary>

[`PolicyPrivilegeForm.tsx:71`](https://github.com/mshuffett/datahub/blob/9f333f49/datahub-web-react/src/app/permissions/policy/PolicyPrivilegeForm.tsx#L71) — `borderDisabled` replaces `#434343` for tag text color. Use `textSecondary` or `textDisabled` instead.
</details>

<details>
<summary><strong>No max-depth guard on glossary hierarchy traversal</strong></summary>

[`GlossaryFieldResolverProvider.java:133`](https://github.com/mshuffett/datahub/blob/9f333f49/metadata-service/auth-impl/src/main/java/com/datahub/authorization/fieldresolverprovider/GlossaryFieldResolverProvider.java#L133) — `while (!currentLevel.isEmpty())` has no upper bound. Deep (non-cyclic) hierarchies cause unbounded sequential API calls. Add `MAX_HIERARCHY_DEPTH` guard.
</details>

<details>
<summary><strong>Silent failure in authorization code (fail-open)</strong></summary>

[`GlossaryFieldResolverProvider.java:111,174,312`](https://github.com/mshuffett/datahub/blob/9f333f49/metadata-service/auth-impl/src/main/java/com/datahub/authorization/fieldresolverprovider/GlossaryFieldResolverProvider.java#L312) — Three catch blocks return partial/empty results on error. Policies may silently not match, potentially granting unintended access. Consider rethrowing from inner catches so the outer handler returns `emptyFieldValue()`.
</details>

<details>
<summary><strong>Integer division truncation in expansion ratio metric</strong></summary>

[`GlossaryFieldResolverProvider.java:108`](https://github.com/mshuffett/datahub/blob/9f333f49/metadata-service/auth-impl/src/main/java/com/datahub/authorization/fieldresolverprovider/GlossaryFieldResolverProvider.java#L108) — `result.size() / Math.max(1, termUrns.size())` is integer division, so ratios below 2x always report as 1.
</details>

---

### Low

<details>
<summary><strong>No loading indicator during glossary search</strong></summary>

[`GlossarySelector.tsx`](https://github.com/mshuffett/datahub/blob/9f333f49/datahub-web-react/src/app/permissions/policy/GlossarySelector.tsx) — The `loading` state from the lazy query isn't used. Consistent with existing selectors.
</details>

<details>
<summary><strong>Static metric caches vs instance-scoped registry</strong></summary>

[`MetricUtils.java:47-57`](https://github.com/mshuffett/datahub/blob/9f333f49/metadata-utils/src/main/java/com/linkedin/metadata/utils/metrics/MetricUtils.java#L47) — Timer/Distribution caches are `static final` but register against an instance-scoped `MeterRegistry`. Multiple instances would share stale cache entries.
</details>

---

## What's Good

- **Feature flag wiring** (frontend): Clean threading through GraphQL -> FeatureFlags -> appConfig -> hook -> conditional render
- **GlossaryFieldResolverProvider**: Well-structured, mirrors `DomainFieldResolverProvider` pattern, comprehensive metrics instrumentation
- **Test coverage**: 655 lines of Java tests (hierarchies, cycles, datasets) + 216 lines of MetricUtils tests
- **Documentation**: Clear additions to `docs/authorization/policies.md` with examples
- **Cycle detection**: `resolveNodesWithParentNodes` correctly handles A->B->A cycles via `allNodes.contains()` check

## New Tests Added

| Test File | Tests | Status |
|-----------|-------|--------|
| `useIsGlossaryBasedPoliciesEnabled.test.ts` | 4 tests (true/false/undefined/isolation) | Written |
| `GlossarySelector.test.tsx` | 7 tests (render, search, browser, selection) | Written |

## Files Changed

<details>
<summary>19 files (+1505/-27)</summary>

| File | Change |
|------|--------|
| `GlossarySelector.tsx` | **New** — Term/group selector |
| `useIsGlossaryBasedPoliciesEnabled.ts` | **New** — Feature flag hook |
| `GlossaryFieldResolverProvider.java` | **New** — Auth hierarchy resolver (323 lines) |
| `GlossaryFieldResolverProviderTest.java` | **New** — Tests (655 lines) |
| `MetricUtilsTest.java` | **Extended** — Timer/distribution tests (216 lines) |
| `TermItem.tsx` | **Modified** — Theme migration (has bugs) |
| `NodeItem.tsx` | **Modified** — Theme migration (clean) |
| `PolicyPrivilegeForm.tsx` | **Modified** — Integrates GlossarySelector |
| `PolicyPrivilegeForm.test.tsx` | **Extended** — Feature flag mock |
| `DefaultEntitySpecResolver.java` | **Modified** — Registers provider |
| `EntityFieldType.java` | **Modified** — Adds GLOSSARY enum |
| `FeatureFlags.java` | **Modified** — Adds flag |
| `application.yaml` | **Modified** — Adds env var |
| `app.graphql` (x2) | **Modified** — Schema + query |
| `appConfigContext.tsx` | **Modified** — Default config |
| `MetricUtils.java` | **Modified** — Timer/distribution methods |
| `policies.md` | **Modified** — Glossary targeting docs |
</details>
