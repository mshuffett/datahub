# PR Review Report

**PR**: [feat(policies): Add ability to target policies based on Glossary Terms and Groups (#16365)](https://github.com/mshuffett/datahub/pull/1)
**Branch**: `feat/glossary-based-policies` -> `pre-glossary-policies`
**Scope**: 19 files changed, +1505 / -27 lines
**Review Date**: 2026-03-20

---

## Overview

This PR adds glossary-based policy targeting to DataHub's authorization system. When the `glossaryBasedPoliciesEnabled` feature flag is on, policy creators can select glossary terms and term groups as resource filters. The Java backend recursively resolves the glossary hierarchy so that a policy targeting a term group automatically covers all descendant terms.

**Architecture**:
- **Frontend**: New `GlossarySelector` component + `useIsGlossaryBasedPoliciesEnabled` hook, integrated into `PolicyPrivilegeForm`
- **Backend**: New `GlossaryFieldResolverProvider` registered in `DefaultEntitySpecResolver`, new `GLOSSARY` enum in `EntityFieldType`
- **Schema**: `glossaryBasedPoliciesEnabled` added to GraphQL `FeatureFlagsConfig`
- **Config**: Feature flag wired through `application.yaml` -> `FeatureFlags.java` -> GraphQL -> React
- **Metrics**: New `recordTimer` and `recordDistribution` methods in `MetricUtils`

---

## Findings

### Critical

#### 1. CSS Syntax Error: Double Closing Braces Break Styled Components

> [!CAUTION]
> Two instances of extra `}` in styled-component template literals produce invalid CSS, breaking the entire style block for selected glossary terms in the browser.

**File**: [`TermItem.tsx:15`](https://github.com/mshuffett/datahub/blob/9f333f49/datahub-web-react/src/app/glossaryV2/GlossaryBrowser/TermItem.tsx#L15)

```tsx
// BUG: Extra } after bgActive
background-color: ${(props) => props.$isSelected && props.theme.colors.bgActive}};
//                                                                              ^^ extra }
```

**File**: [`TermItem.tsx:58`](https://github.com/mshuffett/datahub/blob/9f333f49/datahub-web-react/src/app/glossaryV2/GlossaryBrowser/TermItem.tsx#L58)

```tsx
// BUG: Extra } after textActive
${(props) => props.$isSelected && `color: ${props.theme.colors.textActive}}; font-weight: 700; opacity: 1;`}
//                                                                        ^^ extra }
```

**Impact**: Selected terms in the glossary browser will have broken styling. The `}` becomes part of the CSS value, causing parse errors that may cascade to siblings.

**Fix**:
```tsx
// Line 15
background-color: ${(props) => props.$isSelected && props.theme.colors.bgActive};

// Line 58
${(props) => props.$isSelected && `color: ${props.theme.colors.textActive}; font-weight: 700; opacity: 1;`}
```

---

### High

#### 2. Theme Interpolation Renders as `[Function]` in Plain String

> [!WARNING]
> `nameStyles` uses arrow functions for theme access inside a plain template literal. These functions are never called — they render as their string representation.

**File**: [`TermItem.tsx:27-43`](https://github.com/mshuffett/datahub/blob/9f333f49/datahub-web-react/src/app/glossaryV2/GlossaryBrowser/TermItem.tsx#L27)

```tsx
const nameStyles = `           // <-- plain string, not css``
    color: ${(props) => props.theme.colors.text};        // renders as "color: (props) => ..."
    &:hover {
        color: ${(props) => props.theme.colors.textActive};  // same problem
    }
`;
```

**Root cause**: `nameStyles` is a plain JS template literal (`` ` `` backticks), not a styled-components `css` tagged template. In a plain string, `${fn}` calls `fn.toString()`, producing the function source code as CSS.

**Impact**: All glossary term names in the browser will have `color: (props) => props.theme.colors.text` as their CSS — which is invalid and will be ignored, falling back to inherited color (likely black or the parent's color).

**Fix**: Use the `css` helper from styled-components:
```tsx
import styled, { css } from 'styled-components/macro';

const nameStyles = css`
    color: ${(props) => props.theme.colors.text};
    &:hover {
        color: ${(props) => props.theme.colors.textActive};
    }
`;
```

---

### Medium

#### 3. Semantic Color Token Mismatch: Border Token Used for Text

**File**: [`PolicyPrivilegeForm.tsx:71`](https://github.com/mshuffett/datahub/blob/9f333f49/datahub-web-react/src/app/permissions/policy/PolicyPrivilegeForm.tsx#L71)

```tsx
const StyleTag = styled(CustomTag)`
    color: ${(props) => props.theme.colors.borderDisabled};  // was: #434343
`;
```

`borderDisabled` is semantically a border color token, not a text color. The original `#434343` was a standard dark-gray text color. Using a border token risks visual breakage if themes assign different values to border vs. text tokens.

**Suggested fix**: Use `textSecondary` or `textDisabled` instead.

---

#### 4. No Max-Depth Guard on Glossary Hierarchy Traversal

**File**: [`GlossaryFieldResolverProvider.java:133`](https://github.com/mshuffett/datahub/blob/9f333f49/metadata-service/auth-impl/src/main/java/com/datahub/authorization/fieldresolverprovider/GlossaryFieldResolverProvider.java#L133)

```java
while (!currentLevel.isEmpty()) {  // No max depth check
    levelsTraversed++;
    // ... batch fetch parent nodes ...
}
```

While cycle detection exists (via `allNodes.contains(parentNode)`), a legitimate deep hierarchy would cause unbounded sequential API calls. DomainFieldResolverProvider has the same pattern, but glossary hierarchies can be significantly deeper than domain hierarchies.

**Suggested fix**: Add `&& levelsTraversed < MAX_HIERARCHY_DEPTH` (e.g., 25) to the while condition, with a warning log when the limit is hit.

---

#### 5. Silent Failure in Authorization Code (Fail-Open)

**File**: [`GlossaryFieldResolverProvider.java:111,174,312`](https://github.com/mshuffett/datahub/blob/9f333f49/metadata-service/auth-impl/src/main/java/com/datahub/authorization/fieldresolverprovider/GlossaryFieldResolverProvider.java#L312)

Three catch blocks silently return partial or empty results:
- `resolveTermsWithParentNodes` (line 111): Returns partial result on error
- `resolveNodesWithParentNodes` (line 174): Breaks out of loop, returns partial nodes
- `getGlossary` (line 312): Returns `emptyFieldValue()` on error

**Impact**: If glossary resolution fails (network error, entity store timeout), policies targeting glossary terms will silently **not match**, potentially granting access that should be denied. This is consistent with other field resolvers in the codebase (fail-open pattern), but worth documenting as a known limitation.

---

#### 6. Feature Flag Doesn't Gate Backend Resolver

**File**: [`DefaultEntitySpecResolver.java:29`](https://github.com/mshuffett/datahub/blob/9f333f49/metadata-service/auth-impl/src/main/java/com/datahub/authorization/DefaultEntitySpecResolver.java#L29) and [`FeatureFlags.java:60`](https://github.com/mshuffett/datahub/blob/9f333f49/metadata-service/configuration/src/main/java/com/linkedin/datahub/graphql/featureflags/FeatureFlags.java#L60)

`glossaryBasedPoliciesEnabled` is declared in `FeatureFlags` and wired to the frontend, but `DefaultEntitySpecResolver` unconditionally registers `GlossaryFieldResolverProvider` regardless of the flag value. The feature flag only hides the UI — the backend always resolves glossary hierarchies for policy evaluation. This defeats the purpose of a safe rollout mechanism and means the glossary resolver runs in production even when the feature is "disabled."

**Fix**: Pass `FeatureFlags` (or just the boolean) to `DefaultEntitySpecResolver` and conditionally include `GlossaryFieldResolverProvider` only when `glossaryBasedPoliciesEnabled` is true.

---

#### 7. Integer Division Truncation in Expansion Ratio Metric

**File**: [`GlossaryFieldResolverProvider.java:108`](https://github.com/mshuffett/datahub/blob/9f333f49/metadata-service/auth-impl/src/main/java/com/datahub/authorization/fieldresolverprovider/GlossaryFieldResolverProvider.java#L108)

```java
metricUtils.recordDistribution(
    "glossary.policy.term_expansion_ratio",
    result.size() / Math.max(1, termUrns.size()));  // integer division
```

For 4 terms expanding to 7 total entities, the ratio reports as `1` (truncated from `1.75`). The metric systematically underreports expansion ratios below 2x.

**Fix**: Record numerator and denominator as separate metrics, or cast to double if the API supports it.

---

### Low

#### 8. No Loading Indicator During Glossary Search

**File**: [`GlossarySelector.tsx`](https://github.com/mshuffett/datahub/blob/9f333f49/datahub-web-react/src/app/permissions/policy/GlossarySelector.tsx)

The `useGetSearchResultsForMultipleLazyQuery` hook returns a `loading` state that isn't used. Users see an empty dropdown while search results load. Consistent with existing domain/container selectors.

---

## What's Good

- **Feature flag pattern**: Clean, safe, disabled-by-default. Properly threaded through all layers.
- **GlossaryFieldResolverProvider**: Well-structured, follows existing resolver patterns, comprehensive observability with Micrometer metrics for latency and expansion ratios.
- **Test coverage (Java)**: 655 lines covering term-to-node hierarchies, node hierarchies, deep hierarchies, cycle detection, datasets with single/multiple terms, root-level terms, and error cases.
- **MetricUtils additions**: Clean `recordTimer`/`recordDistribution` API with proper caching. 216 lines of thorough tests.
- **Documentation**: Clear additions to `docs/authorization/policies.md` with concrete examples for glossary, domain, and container-based targeting.
- **NodeItem.tsx refactoring**: Clean migration from `REDESIGN_COLORS` to semantic theme tokens.

---

#### 9. Static Metric Caches vs Instance-Scoped Registry

**File**: [`MetricUtils.java:47-57`](https://github.com/mshuffett/datahub/blob/9f333f49/metadata-utils/src/main/java/com/linkedin/metadata/utils/metrics/MetricUtils.java#L47)

`micrometerTimerCache` and `micrometerDistributionCache` are `static final` maps, but they register meters against an instance-scoped `MeterRegistry`. If multiple `MetricUtils` instances exist with different registries, the static cache returns stale meter objects registered to the first registry. This won't affect production (single instance) but can cause test flakiness.

---

## New Tests Written

| Test File | Tests | Description |
|-----------|-------|-------------|
| [`useIsGlossaryBasedPoliciesEnabled.test.ts`](https://github.com/mshuffett/datahub/blob/0274df8a/datahub-web-react/src/app/shared/hooks/__tests__/useIsGlossaryBasedPoliciesEnabled.test.ts) | 4 | Flag true/false/undefined, isolation |
| [`GlossarySelector.test.tsx`](https://github.com/mshuffett/datahub/blob/0274df8a/datahub-web-react/src/app/permissions/policy/_tests_/GlossarySelector.test.tsx) | 7 | Render, search, browser display, term/node selection, wildcard query |

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| `GlossarySelector.tsx` | React | **New** — Glossary term/group selector component |
| `useIsGlossaryBasedPoliciesEnabled.ts` | React Hook | **New** — Feature flag hook |
| `GlossaryFieldResolverProvider.java` | Java | **New** — Glossary hierarchy resolver for auth |
| `GlossaryFieldResolverProviderTest.java` | Java Test | **New** — 655 lines of tests |
| `MetricUtilsTest.java` | Java Test | **Extended** — 216 lines for timer/distribution |
| `TermItem.tsx` | React | **Modified** — Theme token migration (has bugs) |
| `NodeItem.tsx` | React | **Modified** — Theme token migration (clean) |
| `PolicyPrivilegeForm.tsx` | React | **Modified** — Integrates GlossarySelector |
| `PolicyPrivilegeForm.test.tsx` | React Test | **Extended** — Feature flag mock |
| `DefaultEntitySpecResolver.java` | Java | **Modified** — Registers new provider |
| `EntityFieldType.java` | Java Enum | **Modified** — Adds GLOSSARY |
| `FeatureFlags.java` | Java Config | **Modified** — Adds feature flag |
| `application.yaml` | Config | **Modified** — Adds env var |
| `app.graphql` | GraphQL | **Modified** — Adds to FeatureFlagsConfig |
| `appConfigContext.tsx` | React | **Modified** — Adds default |
| `app.graphql` (frontend) | GraphQL | **Modified** — Adds to query |
| `MetricUtils.java` | Java | **Modified** — Adds timer/distribution methods |
| `policies.md` | Docs | **Modified** — Adds glossary targeting docs |
