# Executive Summary

![Scope](https://img.shields.io/badge/scope-19_files_|_+1505_lines-blue) ![Critical](https://img.shields.io/badge/critical-2-red) ![High](https://img.shields.io/badge/high-1-orange) ![Tests](https://img.shields.io/badge/new_tests-11-green)

<table>
<tr>
<td width="33%"><img src="https://raw.githubusercontent.com/mshuffett/datahub/0274df8a/pr-review-assets/state-a-browser-open.png"/><br/><em>Glossary browser view</em></td>
<td width="33%"><img src="https://raw.githubusercontent.com/mshuffett/datahub/0274df8a/pr-review-assets/state-b-search-dropdown.png"/><br/><em>Search dropdown</em></td>
<td width="33%"><img src="https://raw.githubusercontent.com/mshuffett/datahub/0274df8a/pr-review-assets/state-c-tags-selected.png"/><br/><em>Selected terms as tags</em></td>
</tr>
</table>

## Top 3 Findings

### 1. CSS Syntax Error Breaks Glossary Browser Styling

[`TermItem.tsx:15`](https://github.com/mshuffett/datahub/blob/9f333f49/datahub-web-react/src/app/glossaryV2/GlossaryBrowser/TermItem.tsx#L15), [`TermItem.tsx:58`](https://github.com/mshuffett/datahub/blob/9f333f49/datahub-web-react/src/app/glossaryV2/GlossaryBrowser/TermItem.tsx#L58) — Double `}}` in two styled-components produces invalid CSS. Selected terms lose all custom styling. One-character fix each.

### 2. Theme Functions Render as `[Function]` Text

[`TermItem.tsx:27`](https://github.com/mshuffett/datahub/blob/9f333f49/datahub-web-react/src/app/glossaryV2/GlossaryBrowser/TermItem.tsx#L27) — `nameStyles` uses a plain template literal instead of styled-components' `css` tagged template. Arrow functions for theme access are stringified, not executed. All term names get `color: (props) => ...` as CSS. Fix: change `` ` `` to `` css` ``.

### 3. Feature Flag Doesn't Gate Backend Resolver

[`DefaultEntitySpecResolver.java:29`](https://github.com/mshuffett/datahub/blob/9f333f49/metadata-service/auth-impl/src/main/java/com/datahub/authorization/DefaultEntitySpecResolver.java#L29) — `GlossaryFieldResolverProvider` is registered unconditionally, ignoring `glossaryBasedPoliciesEnabled`. The flag only hides the UI — the backend always resolves glossary hierarchies. Defeats safe rollout.

## Review Highlights

| Area | Assessment |
|------|-----------|
| Feature flag wiring (frontend) | Clean, well-structured |
| `GlossaryFieldResolverProvider` | Good architecture, mirrors existing patterns |
| Java test coverage | 655 lines, thorough hierarchy + cycle tests |
| `MetricUtils` additions | Clean API, 216 lines of tests |
| Documentation | Clear examples added |
| Styled-component changes | **2 critical bugs, 1 high bug** |
| Backend feature gating | **Missing** |

## New Tests Written by This Review

- `GlossarySelector.test.tsx` — 7 tests (render, search, browser, term/node selection)
- `useIsGlossaryBasedPoliciesEnabled.test.ts` — 4 tests (flag true/false/undefined)

---

<sub>Automated review by <a href="https://github.com/mshuffett/datahub/pull/1">PR Review Bot</a> | 19 files analyzed | 3 background agents | Screenshots via Playwright</sub>
