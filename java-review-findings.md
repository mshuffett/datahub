# Java Backend Review Findings

## Critical

### No max-depth guard on resolveNodesWithParentNodes
- **File**: metadata-service/auth-impl/src/main/java/com/datahub/authorization/fieldresolverprovider/GlossaryFieldResolverProvider.java
- **Lines**: 133–178
- **Issue**: The `while (!currentLevel.isEmpty())` loop has no upper bound on traversal depth. Although the `allNodes.contains(parentNode)` check prevents re-visiting already-seen nodes (and therefore handles true cycles), it does not bound legitimate deep hierarchies. A glossary tree 100 levels deep will issue 100 sequential batch-fetch round-trips inside a synchronous auth check. Contrast with `DomainFieldResolverProvider`, which has the same structural pattern but also relies on `removeAll(domainUrns)` to converge — neither provider caps depth, but the glossary tree is more likely to be deep in practice (nested classification taxonomies). The `ContainerFieldResolverProvider` has the same issue but calls `getV2` (single entity, not batch), making the per-level cost higher but also making it obvious. In the glossary case the risk is a latency spike on every policy evaluation for any entity tagged with a term inside a deep hierarchy.
- **Fix**: Add a configurable `MAX_HIERARCHY_DEPTH` constant (e.g., 20) and break out of the loop with a warning log when `levelsTraversed` exceeds it. Log the entity URN so operators can investigate malformed data.
- **Confidence**: high

### Exception swallowing in resolveTermsWithParentNodes returns partial results silently during auth
- **File**: metadata-service/auth-impl/src/main/java/com/datahub/authorization/fieldresolverprovider/GlossaryFieldResolverProvider.java
- **Lines**: 111–113
- **Issue**: When `batchGetV2` throws inside `resolveTermsWithParentNodes`, the catch block logs the error and returns `result`, which at that point contains only the raw input term URNs without their parent nodes. This means policy evaluation continues with an **incomplete** resolved set. A policy that grants access to "anyone whose asset is tagged with term X or any ancestor node" will silently fail to include the ancestor nodes if the network call errored, potentially producing incorrect **deny** decisions. In `resolveNodesWithParentNodes` (line 174–177) the catch breaks out of the loop, which has the same character: partial results are returned. Neither caller nor the caller's caller surfaces the partial-result condition. The outer `getGlossary` catch (line 312) returns `emptyFieldValue()` on error, which is a safe-deny-on-error posture, but the inner catches subvert this.
- **Fix**: Either (a) rethrow from the inner catch blocks so the outer handler in `getGlossary` can return `emptyFieldValue()` (safe-deny on error), or (b) introduce an explicit `boolean fullyResolved` flag and return empty when resolution was incomplete. Option (a) is simpler and consistent with the outer handler's existing behavior.
- **Confidence**: high

---

## High

### Static metric caches bound to instance-scoped MeterRegistry — cross-instance pollution
- **File**: metadata-utils/src/main/java/com/linkedin/metadata/utils/metrics/MetricUtils.java
- **Lines**: 47–57
- **Issue**: `legacyTimeCache`, `micrometerCounterCache`, `micrometerTimerCache`, `micrometerDistributionCache`, and the others are all `static final` maps, but the `MeterRegistry registry` field they register meters against is **instance-scoped** (set per `MetricUtils` instance). If two `MetricUtils` instances are created with different registries (e.g., one with a `SimpleMeterRegistry` in tests, one with the production `CompositeMeterRegistry`), the static cache will return a `Timer` or `Counter` object that was registered against the first registry, and subsequent calls on the second instance will silently record into the wrong registry. This is demonstrated by the test: each `@BeforeMethod` creates a new `MetricUtils` with a fresh `SimpleMeterRegistry`, but the static caches from a previous test run are not cleared. The `tearDown` calls `meterRegistry.clear()` and `meterRegistry.close()` but never purges the static caches, so the caches hold closed/stale meter objects across tests.
- **Fix**: Either make the caches instance fields (not static), or key the cache on `System.identityHashCode(registry) + metricName + tags` so different registries never share cached entries. Making them instance fields is simpler and eliminates the cross-contamination entirely.
- **Confidence**: high

### Feature flag exists but is not wired to the GlossaryFieldResolverProvider
- **File**: metadata-service/configuration/src/main/java/com/linkedin/datahub/graphql/featureflags/FeatureFlags.java (line 60) and GlossaryFieldResolverProvider.java / DefaultEntitySpecResolver.java
- **Issue**: `glossaryBasedPoliciesEnabled` is declared in `FeatureFlags` and set in `application.yaml` (line 1018, default `false`). However, `DefaultEntitySpecResolver` unconditionally instantiates and registers `GlossaryFieldResolverProvider` (line 29) regardless of the flag. The feature flag has no effect at runtime — glossary-based resolution is always active even when the flag is off. This defeats the purpose of the flag (safe rollout, easy rollback).
- **Fix**: Pass `FeatureFlags` (or just the boolean) into `DefaultEntitySpecResolver` and conditionally include `GlossaryFieldResolverProvider` in the provider list only when `glossaryBasedPoliciesEnabled` is true.
- **Confidence**: high

---

## Medium

### Cycle detection is sufficient for simple cycles but not for self-referencing nodes
- **File**: metadata-service/auth-impl/src/main/java/com/datahub/authorization/fieldresolverprovider/GlossaryFieldResolverProvider.java
- **Lines**: 162–166
- **Issue**: `if (!allNodes.contains(parentNode))` correctly prevents A→B→A cycles from looping. It also handles A→A (self-reference) because A is added to `allNodes` before processing begins. The test at line 209 validates the two-node cycle case. This is technically correct. However, the test for the self-reference case is absent (a node whose `parentNode` points to itself). While the logic handles it correctly because the starting node is seeded into `allNodes`, this edge case is undocumented and untested.
- **Fix**: Add a test case for a self-referencing node to document and lock in the behavior.
- **Confidence**: medium

### Integer division truncation in term_expansion_ratio metric
- **File**: metadata-service/auth-impl/src/main/java/com/datahub/authorization/fieldresolverprovider/GlossaryFieldResolverProvider.java
- **Line**: 108
- **Issue**: `result.size() / Math.max(1, termUrns.size())` performs integer division before passing to `recordDistribution(String, long, ...)`. For a single term that expands to 3 nodes the ratio is `3/1 = 3`, which is fine, but for 4 terms expanding to 7 total the ratio is `7/4 = 1` (truncated). The metric will systematically underreport expansion ratios below 2x. `recordDistribution` accepts a `long`, so the cast is implicit and silent.
- **Fix**: Either record `result.size()` and `termUrns.size()` as two separate metrics (numerator/denominator) and let the monitoring layer compute the ratio, or cast to `double` and use a different recording method if the API supports it.
- **Confidence**: medium

### Missing test coverage: error/partial-failure paths
- **File**: metadata-service/auth-impl/src/test/java/com/datahub/authorization/fieldresolverprovider/GlossaryFieldResolverProviderTest.java
- **Issue**: The test suite covers the happy-path cases well (term with parents, node with parents, dataset with terms, cycle prevention, deep hierarchy). The following scenarios have no test coverage:
  1. `batchGetV2` throws `RemoteInvocationException` during term resolution — verifying that the provider returns a safe/partial result (the current behavior) or empty (the desired behavior after the fix described in Critical #2).
  2. `batchGetV2` throws during node hierarchy resolution mid-traversal.
  3. `getV2` throws for the dataset glossary terms fetch.
  4. An entity whose URN cannot be parsed (`UrnUtils.getUrn` throws `IllegalArgumentException`).
  5. A dataset with a `GlossaryTerms` aspect that has an empty `terms` array (not null, but zero length) — `resolveTermsWithParentNodes` is called with an empty set, which triggers `batchGetV2` with an empty set. Depending on the client implementation this may throw or return an empty map.
- **Fix**: Add tests for at least scenarios 1–3 to verify the error posture of an auth-critical path.
- **Confidence**: high

### Backward compatibility of GLOSSARY enum addition to EntityFieldType
- **File**: metadata-auth/auth-api/src/main/java/com/datahub/authorization/EntityFieldType.java
- **Line**: 37
- **Issue**: Java enums serialize by name (not ordinal) in most frameworks (Jackson, Gson). Adding `GLOSSARY` at the end of the enum is safe for JSON serialization. However, if any code path serializes `EntityFieldType` by ordinal (e.g., stored policy documents, Kafka messages, or PDL-generated Pegasus models that store the integer position), the addition is safe only because it is appended at the end. There is no evidence in the reviewed code of ordinal-based serialization, but it is worth confirming that persisted `DataHubPolicyInfo` models (which reference resource/principal field types) do not store `EntityFieldType` by ordinal.
- **Fix**: Verify that `DataHubPolicyInfo` PDL schema and any stored policy JSON does not reference `EntityFieldType` by ordinal. Add a comment to the enum noting "always append — do not reorder".
- **Confidence**: medium

---

## Notes

- **MetricUtils test isolation**: The `testAllMetricsHaveDropwizardTag` test at line 244 asserts that *all* meters in the registry have the Dropwizard tag. This will fail if any test-helper or prior test call registers a non-Dropwizard meter into the same `meterRegistry` before this assertion runs. The test is fragile given the static cache issue described above.

- **Metrics instrumentation volume**: `GlossaryFieldResolverProvider` records 3–4 metrics per policy resolution call (field_resolution.duration, field_checks, resolve_terms.duration, term_expansion_ratio, resolve_nodes.duration, node_hierarchy_depth). This is heavier than any other field resolver provider. For high-throughput authorization paths (e.g., REST API authorization on every request) this could add measurable overhead. Consider whether debug-level timing metrics should be sampled or gated behind a flag.

- **N+1 query pattern in resolveTermsWithParentNodes → resolveNodesWithParentNodes**: The two-step call chain (batch-fetch all terms, then loop fetching each level of nodes) is structurally as efficient as the data model allows — parent relationships are per-entity and require a lookup. This is the same pattern used by `DomainFieldResolverProvider`. No additional batching opportunity is obvious without a pre-built hierarchy index.

- **ContainerFieldResolverProvider comparison**: Unlike `GlossaryFieldResolverProvider`, `ContainerFieldResolverProvider` uses a `while(true)` loop with `getV2` per level (not batched) and has no cycle detection at all — a cycle would loop forever. `GlossaryFieldResolverProvider`'s design is strictly better than the existing container provider in these respects.

- **No feature-flag guard in tests**: The test class does not test any behavior related to `glossaryBasedPoliciesEnabled = false` because the provider is instantiated directly. Once the feature flag wiring is added to `DefaultEntitySpecResolver`, an integration-level test covering the disabled path would be needed.
