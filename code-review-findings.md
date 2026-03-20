# PR Review: Glossary-Based Policy Targeting

## Summary

**PR**: feat(policies): Add ability to target policies based on Glossary Terms and Groups (#16365)
**Scope**: 19 files, +1505/-27 lines across React frontend, Java backend, GraphQL schema, and documentation
**SHA**: `9f333f4952d8c000552654adf02bdaad3d9b15f2`

This PR adds the ability to target metadata policies based on glossary terms and term groups. When enabled via feature flag, policy creators can select glossary terms/groups in the PolicyPrivilegeForm, and the Java backend recursively resolves the glossary hierarchy for policy evaluation.

---

## Findings

### CRITICAL: CSS Syntax Error — Double Closing Braces in TermItem.tsx

**File**: `datahub-web-react/src/app/glossaryV2/GlossaryBrowser/TermItem.tsx`
**Confidence**: High

Two instances of extra `}` that will produce invalid CSS:

**Instance 1** — TermWrapper (line ~12 of new code):
```tsx
background-color: ${(props) => props.$isSelected && props.theme.colors.bgActive}};
//                                                                              ^^ extra }
```
Produces: `background-color: #abc123}` — breaks the entire style block for selected terms.

**Instance 2** — TermLink (line ~58 of new code):
```tsx
${(props) => props.$isSelected && `color: ${props.theme.colors.textActive}}; font-weight: 700; opacity: 1;`}
//                                                                        ^^ extra }
```
Produces: `color: #abc123}` — breaks selected term link styling.

**Fix**: Remove the extra `}` in both locations:
```tsx
// TermWrapper
background-color: ${(props) => props.$isSelected && props.theme.colors.bgActive};

// TermLink
${(props) => props.$isSelected && `color: ${props.theme.colors.textActive}; font-weight: 700; opacity: 1;`}
```

---

### HIGH: Theme Interpolation in Plain String — TermItem.tsx

**File**: `datahub-web-react/src/app/glossaryV2/GlossaryBrowser/TermItem.tsx`
**Confidence**: High

`nameStyles` is declared as a plain template literal, not a styled-components `css` tagged template:

```tsx
const nameStyles = `
    color: ${(props) => props.theme.colors.text};
    ...
    &:hover {
        color: ${(props) => props.theme.colors.textActive};
    }
`;
```

In a plain string, `${(props) => props.theme.colors.text}` evaluates to the **string representation of the arrow function** (e.g., `"(props) => props.theme.colors.text"` or `"[Function]"`), not the resolved theme color. The CSS output will be:
```css
color: (props) => props.theme.colors.text;
```

**Fix**: Import `css` from styled-components and use it as a tagged template:
```tsx
import styled, { css } from 'styled-components/macro';

const nameStyles = css`
    color: ${(props) => props.theme.colors.text};
    ...
`;
```

Or use a callback pattern:
```tsx
const nameStyles = (props) => css`
    color: ${props.theme.colors.text};
    ...
`;
```

---

### MEDIUM: Semantic Color Token Mismatch — PolicyPrivilegeForm.tsx

**File**: `datahub-web-react/src/app/permissions/policy/PolicyPrivilegeForm.tsx`
**Line**: StyleTag component (~line 70)
**Confidence**: Medium

```tsx
color: ${(props) => props.theme.colors.borderDisabled};
```

The original code used `#434343` (a dark gray) for tag text color. It was replaced with `borderDisabled`, a token semantically intended for disabled border styling, not text. This may produce a visually incorrect color depending on the theme, and creates a maintenance risk — if someone changes `borderDisabled` for its intended purpose (borders), tag text color will unexpectedly change.

**Fix**: Use a text-appropriate token:
```tsx
color: ${(props) => props.theme.colors.textSecondary};
// or
color: ${(props) => props.theme.colors.textDisabled};
```

---

### MEDIUM: No Max-Depth Guard on Recursive Hierarchy Traversal

**File**: `metadata-service/auth-impl/src/main/java/com/datahub/authorization/fieldresolverprovider/GlossaryFieldResolverProvider.java`
**Method**: `resolveNodesWithParentNodes`
**Confidence**: Medium

The method walks up the glossary node hierarchy with no maximum depth limit:
```java
while (!currentLevel.isEmpty()) {
    levelsTraversed++;
    // ... fetch parent nodes, add to nextLevel ...
}
```

While cycle detection exists (via `allNodes.contains(parentNode)`), a legitimate deep hierarchy (e.g., 50+ levels) would cause 50+ sequential API calls. Each call is a `batchGetV2` to the entity store.

**Fix**: Add a max depth constant:
```java
private static final int MAX_HIERARCHY_DEPTH = 25;

while (!currentLevel.isEmpty() && levelsTraversed < MAX_HIERARCHY_DEPTH) {
    // ...
}
if (levelsTraversed >= MAX_HIERARCHY_DEPTH) {
    log.warn("Glossary node hierarchy exceeded max depth {} for nodes: {}",
             MAX_HIERARCHY_DEPTH, nodeUrns);
}
```

---

### MEDIUM: Silent Failure in Authorization Code

**File**: `metadata-service/auth-impl/src/main/java/com/datahub/authorization/fieldresolverprovider/GlossaryFieldResolverProvider.java`
**Methods**: `resolveTermsWithParentNodes`, `getGlossary`
**Confidence**: Medium

Both methods catch `Exception` broadly and return partial/empty results:

```java
// resolveTermsWithParentNodes
} catch (Exception e) {
    log.error("Error resolving terms with parent nodes for {} terms", termUrns.size(), e);
}
return result; // Returns partial result — may be missing parent nodes

// getGlossary
} catch (Exception e) {
    log.error("Error while retrieving glossary for entitySpec {}", entitySpec, ...);
    return FieldResolver.emptyFieldValue(); // Fails OPEN — policy won't match
}
```

In an authorization system, this is a fail-open pattern. If glossary resolution fails:
- A policy targeting a glossary term group may NOT apply to entities it should protect
- Users could access resources they shouldn't have access to

This matches DataHub's existing patterns (other field resolvers do the same), but it's worth documenting as a known trade-off between availability and security.

---

### LOW: Missing Loading/Error State in GlossarySelector

**File**: `datahub-web-react/src/app/permissions/policy/GlossarySelector.tsx`
**Confidence**: Medium

The component uses `useGetSearchResultsForMultipleLazyQuery` but doesn't handle:
- Loading state during search (no spinner or "Searching..." text)
- Error state if the GraphQL query fails
- Empty state when search returns no results

Compare with the domain/container selectors in the same form which have similar gaps, so this is consistent with the existing pattern.

---

## Positive Observations

- **Feature flag architecture**: Clean threading from `application.yaml` → `FeatureFlags.java` → GraphQL schema → `appConfigContext.tsx` → `useIsGlossaryBasedPoliciesEnabled` hook → conditional render. Feature is safely disabled by default.
- **GlossaryFieldResolverProvider**: Well-structured, follows existing patterns (mirrors `DomainFieldResolverProvider`), has comprehensive instrumentation with metrics for latency and expansion ratios.
- **Test coverage**: 655 lines of Java tests covering term→node hierarchy, node→parent hierarchy, deep hierarchies, cycle prevention, datasets with terms, multiple terms, root-level terms. Very thorough.
- **MetricUtils additions**: Clean `recordTimer` and `recordDistribution` methods with proper caching. 216 lines of new metric tests.
- **Documentation**: Clear additions to `docs/authorization/policies.md` with examples for glossary-based, domain-based, and container-based policy targeting.
- **NodeItem.tsx refactoring**: Clean migration from hardcoded `REDESIGN_COLORS` constants to theme tokens.
