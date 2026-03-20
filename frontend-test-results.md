# Frontend Test Results

## Environment
- Node version: v24.11.0
- Yarn version: 1.22.22
- Install status: success (with --ignore-engines; peer dep warnings only, no blocking errors)
- GraphQL codegen: ran `yarn generate` to produce `src/types.generated.ts` and `src/*.generated.ts` (files were absent before)

## Existing Test Results

### PolicyPrivilegeForm.test.tsx

```
 RUN  v3.2.2 /private/tmp/datahub-demo/datahub-web-react
      Coverage enabled with v8

 ✓ PolicyPrivilegeForm > renders form with container section for metadata policy type 132ms
 ✓ PolicyPrivilegeForm > does not show container section for platform policy type 30ms
 ✓ PolicyPrivilegeForm > uses getDisplayName for containers 64ms
 ✓ PolicyPrivilegeForm > renders container selection UI correctly 98ms
 ✓ PolicyPrivilegeForm > calls setResources when selecting a container 103ms
 ✓ PolicyPrivilegeForm > calls setResources when deselecting a container 63ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  13:51:32
   Duration  17.60s
```

Note: stderr output contains "No more mocked responses for the query: scrollAcrossEntities" — this is a warning from the Apollo MockedProvider inside the component tree, not a test failure. All 6 tests pass.

## New Tests Written

### useIsGlossaryBasedPoliciesEnabled.test.ts

**File:** `src/app/shared/hooks/__tests__/useIsGlossaryBasedPoliciesEnabled.test.ts`

Key decisions:
- Used `@testing-library/react-hooks` (not `@testing-library/react`) because this project pins `@testing-library/react@12.1.5`, which does not export `renderHook` (added in v13).
- Mocked `@app/useAppConfig` with `vi.mock` factory, then re-imported it to get the mocked reference for per-test `.mockReturnValue` calls.

```typescript
import { renderHook } from '@testing-library/react-hooks';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useIsGlossaryBasedPoliciesEnabled } from '@app/shared/hooks/useIsGlossaryBasedPoliciesEnabled';

vi.mock('@app/useAppConfig', () => ({
    useAppConfig: vi.fn(),
}));

import { useAppConfig } from '@app/useAppConfig';

const mockUseAppConfig = useAppConfig as ReturnType<typeof vi.fn>;

describe('useIsGlossaryBasedPoliciesEnabled', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns true when glossaryBasedPoliciesEnabled feature flag is true', () => {
        mockUseAppConfig.mockReturnValue({
            config: { featureFlags: { glossaryBasedPoliciesEnabled: true } },
        });
        const { result } = renderHook(() => useIsGlossaryBasedPoliciesEnabled());
        expect(result.current).toBe(true);
    });

    it('returns false when glossaryBasedPoliciesEnabled feature flag is false', () => {
        mockUseAppConfig.mockReturnValue({
            config: { featureFlags: { glossaryBasedPoliciesEnabled: false } },
        });
        const { result } = renderHook(() => useIsGlossaryBasedPoliciesEnabled());
        expect(result.current).toBe(false);
    });

    it('returns undefined when the feature flag is not set', () => {
        mockUseAppConfig.mockReturnValue({ config: { featureFlags: {} } });
        const { result } = renderHook(() => useIsGlossaryBasedPoliciesEnabled());
        expect(result.current).toBeUndefined();
    });

    it('reads the flag from config.featureFlags.glossaryBasedPoliciesEnabled', () => {
        mockUseAppConfig.mockReturnValue({
            config: { featureFlags: { glossaryBasedPoliciesEnabled: true, someOtherFlag: false } },
        });
        const { result } = renderHook(() => useIsGlossaryBasedPoliciesEnabled());
        expect(result.current).toBe(true);
        expect(mockUseAppConfig).toHaveBeenCalledTimes(1);
    });
});
```

**Vitest output:**
```
 RUN  v3.2.2 /private/tmp/datahub-demo/datahub-web-react

 ✓ useIsGlossaryBasedPoliciesEnabled > returns true when glossaryBasedPoliciesEnabled feature flag is true 6ms
 ✓ useIsGlossaryBasedPoliciesEnabled > returns false when glossaryBasedPoliciesEnabled feature flag is false 0ms
 ✓ useIsGlossaryBasedPoliciesEnabled > returns undefined when the feature flag is not set 1ms
 ✓ useIsGlossaryBasedPoliciesEnabled > reads the flag from config.featureFlags.glossaryBasedPoliciesEnabled 1ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  13:49:30
   Duration  7.01s
```

---

### GlossarySelector.test.tsx

**File:** `src/app/permissions/policy/_tests_/GlossarySelector.test.tsx`

Placed in `_tests_` to match the existing PR convention (the policy directory uses `_tests_`, not `__tests__`).

Key decisions:
- `@graphql/search.generated` mock uses `importOriginal` spread to preserve all fragment doc exports (e.g. `SearchResultFieldsFragmentDoc`). Without this, vitest throws "No export defined on mock" for every fragment constant the module re-exports.
- `@app/permissions/policy/policyUtils` also uses `importOriginal` spread so non-mocked exports (types, etc.) remain available.
- `GlossaryBrowser`, `ClickOutside`, and `BrowserWrapper` are shallow-mocked since they have deep Apollo/GraphQL trees.
- `await import()` inside non-async `it` bodies is rejected by the babel-macros parser used by vite-plugin-babel-macros; the last test instead calls `vi.mocked(policyUtils.getFieldValues).mockImplementation(...)` synchronously using the module namespace import.

```typescript
// See full file at:
// src/app/permissions/policy/_tests_/GlossarySelector.test.tsx
```

**Vitest output:**
```
 RUN  v3.2.2 /private/tmp/datahub-demo/datahub-web-react

 ✓ GlossarySelector > renders without crashing 41ms
 ✓ GlossarySelector > shows the policy description text 5ms
 ✓ GlossarySelector > shows placeholder text on the Select input 4ms
 ✓ GlossarySelector > calls searchGlossaryEntities when user types in search input 16ms
 ✓ GlossarySelector > shows the GlossaryBrowser when input is focused and empty 7ms
 ✓ GlossarySelector > calls setResources with the selected term when selectTerm is triggered from browser 9ms
 ✓ GlossarySelector > calls setResources when selectNode is triggered from browser 8ms
 ✓ GlossarySelector > uses wildcard query when search text is 2 characters or fewer 9ms
 ✓ GlossarySelector > renders existing glossary terms when resources contain GLOSSARY criteria 10ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  13:50:43
   Duration  8.57s
```

## Summary
- **19 tests passed** (6 existing + 4 new hook tests + 9 new GlossarySelector tests)
- **0 tests failed**
- Blockers encountered and resolved:
  1. `src/types.generated.ts` missing — resolved by running `yarn generate` (codegen succeeded)
  2. `renderHook` not in `@testing-library/react@12.1.5` — resolved by importing from `@testing-library/react-hooks` (available in node_modules)
  3. `@graphql/search.generated` mock missing fragment doc re-exports — resolved with `importOriginal` spread pattern
  4. `await import()` in sync `it` body rejected by vite-plugin-babel-macros parser — resolved by using synchronous `vi.mocked()` on the namespace import
