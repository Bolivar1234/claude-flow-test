# DAXIOM Test Pattern Embedding - Implementation Guide

**Date**: 2026-02-08
**Source**: OpenClaw Testing Patterns (22 patterns extracted)
**Target**: DAXIOM PostgreSQL `tribal_intelligence.patterns` table
**Embedding Model**: Gemini text-embedding-004 (1536-dim)
**Status**: Ready for embedding via RuBot server

---

## Patterns to Embed (22 Total)

### Configuration & Setup (5 patterns)

1. **test-strategy-001**: Multi-Config Vitest Strategy with Layered Inheritance
   - **Description**: OpenClaw uses six separate Vitest configuration files to partition the test suite into distinct tiers: unit, e2e, extensions, gateway, and live tests. Each config extends a shared base through TypeScript composition.
   - **Source**: vitest.config.ts, vitest.unit.config.ts, vitest.e2e.config.ts, etc.
   - **Key Concepts**: vitest, multi-config, test partitioning, config inheritance, worker pools, forks pool
   - **Tags**: vitest, test-configuration, test-partitioning, ci-cd, openclaw, mission-control-source

2. **test-strategy-002**: Dynamic Worker Allocation for CI vs Local Environments
   - **Description**: OpenClaw dynamically calculates Vitest worker counts based on execution environment (CI vs local) and platform (Windows vs Unix), with distinct strategies for unit tests and e2e tests.
   - **Source**: vitest.config.ts, vitest.e2e.config.ts, vitest.live.config.ts
   - **Key Concepts**: worker allocation, CI detection, platform awareness, resource management, forks pool
   - **Tags**: vitest, ci-cd, worker-management, performance, openclaw, mission-control-source

3. **test-strategy-003**: V8 Coverage with Tiered Exclusion Strategy
   - **Description**: OpenClaw uses Vitest's V8 coverage provider with 70% thresholds and a carefully curated exclusion list that separates code validated by unit tests from code validated by e2e/manual testing.
   - **Source**: vitest.config.ts, package.json
   - **Key Concepts**: v8 coverage, coverage thresholds, tiered exclusions, coverage strategy, lcov
   - **Tags**: coverage, v8, testing-strategy, thresholds, openclaw, mission-control-source

4. **test-strategy-004**: Isolated Test Environment with HOME Directory Sandboxing
   - **Description**: OpenClaw isolates each test run by creating a temporary HOME directory, redirecting all XDG paths and application state directories, and stripping sensitive environment variables to prevent tests from touching real user state.
   - **Source**: test/test-env.ts, test/setup.ts, test/global-setup.ts
   - **Key Concepts**: environment isolation, temporary directories, XDG paths, credential stripping, live test detection
   - **Tags**: test-isolation, environment, security, temp-directories, openclaw, mission-control-source

5. **test-strategy-005**: Plugin Registry Stub System for Channel Testing
   - **Description**: OpenClaw provides a test setup pattern that creates stub ChannelPlugin instances and a test plugin registry, ensuring every test starts with a consistent set of channel plugins without loading real implementations.
   - **Source**: test/setup.ts, src/test-utils/channel-plugins.ts, src/plugins/runtime.ts
   - **Key Concepts**: plugin registry stubs, channel plugins, test fixtures, beforeEach/afterEach, dependency injection
   - **Tags**: test-stubs, plugin-registry, channel-testing, mocking, openclaw, mission-control-source

### Mocking & Isolation (4 patterns)

6. **test-strategy-006**: Deterministic Port Block Allocation for Parallel Test Workers
   - **Description**: OpenClaw implements a deterministic port allocation scheme that assigns non-overlapping port ranges to parallel test workers, preventing EADDRINUSE errors when tests spin up gateway servers with derived ports.
   - **Source**: src/test-utils/ports.ts
   - **Key Concepts**: port allocation, parallel testing, worker isolation, derived ports, EADDRINUSE prevention
   - **Tags**: parallel-testing, port-management, e2e-testing, test-infrastructure, openclaw, mission-control-source

7. **test-strategy-007**: Module-Level vi.mock for External Dependencies
   - **Description**: OpenClaw uses Vitest's vi.mock() at the module level to replace external dependency modules with controlled implementations, particularly for media loading and runtime creation.
   - **Source**: test/auto-reply.retry.test.ts, src/plugins/voice-call.plugin.test.ts, src/plugins/install.test.ts
   - **Key Concepts**: vi.mock, module mocking, hoisted mocks, vi.doMock, vi.importActual, stub factories
   - **Tags**: mocking, vitest, dependency-injection, test-doubles, openclaw, mission-control-source

8. **test-strategy-008**: Inline Plugin API Stubbing Pattern for Plugin Tests
   - **Description**: OpenClaw tests plugins by constructing a minimal inline stub of the OpenClawPluginApi interface, capturing registration calls in local data structures like Maps and arrays.
   - **Source**: src/plugins/voice-call.plugin.test.ts, src/plugins/loader.test.ts
   - **Key Concepts**: api stubbing, registration capture, inline stubs, plugin testing, noop logger
   - **Tags**: plugin-testing, stubs, api-mocking, registration-testing, openclaw, mission-control-source

9. **test-strategy-009**: Temporary Plugin Filesystem Scaffolding for Loader Tests
   - **Description**: OpenClaw's plugin loader tests create complete temporary plugin directories with source files, manifests, and package.json files on disk, then load them through the real plugin system to verify discovery, loading, and configuration.
   - **Source**: src/plugins/loader.test.ts, src/plugins/discovery.test.ts, src/plugins/install.test.ts
   - **Key Concepts**: filesystem scaffolding, temp directories, plugin manifests, real IO testing, environment variable overrides
   - **Tags**: integration-testing, filesystem, plugin-loading, temp-directories, openclaw, mission-control-source

### Integration & E2E (3 patterns)

10. **test-strategy-010**: Gateway Multi-Instance E2E Test with Process Spawning
    - **Description**: OpenClaw's e2e test suite spawns actual gateway processes as child processes, waits for port binding, and tests inter-gateway communication using the GatewayClient protocol.
    - **Source**: test/gateway.multi.e2e.test.ts, test/provider-timeout.e2e.test.ts, test/media-understanding.auto.e2e.test.ts
    - **Key Concepts**: process spawning, gateway testing, port readiness, e2e infrastructure, child process management
    - **Tags**: e2e-testing, gateway, process-spawning, integration-testing, openclaw, mission-control-source

11. **test-strategy-011**: Docker-Based E2E Test Suite for Full-Stack Scenarios
    - **Description**: OpenClaw maintains a comprehensive set of Docker-based e2e tests that run gateway, onboarding, QR import, doctor/switch, and plugin scenarios in containerized environments.
    - **Source**: package.json, Dockerfile.sandbox, Dockerfile.sandbox-browser, docker-compose.yml
    - **Key Concepts**: docker testing, containerized tests, full-stack e2e, shell test scripts, sequential test chains
    - **Tags**: docker, e2e-testing, containerization, full-stack-testing, openclaw, mission-control-source

12. **test-strategy-012**: Live Test Mode with Real API Key Detection
    - **Description**: OpenClaw supports a live test mode that runs tests against real external services using actual API keys, activated via environment variables and configured to load credentials from ~/.profile.
    - **Source**: vitest.live.config.ts, test/test-env.ts, package.json
    - **Key Concepts**: live testing, API key management, profile loading, environment detection, serial execution
    - **Tags**: live-testing, api-keys, environment-variables, external-services, openclaw, mission-control-source

### Error Handling & Contracts (2 patterns)

13. **test-strategy-013**: Retry and Transient Failure Testing Pattern
    - **Description**: OpenClaw tests retry behavior by using vi.fn() mocks that reject on the first call and resolve on the second, verifying that retry logic handles transient failures correctly.
    - **Source**: test/auto-reply.retry.test.ts
    - **Key Concepts**: retry testing, transient failures, mockRejectedValueOnce, mockResolvedValueOnce, call count verification
    - **Tags**: retry-logic, error-handling, mocking, resilience-testing, openclaw, mission-control-source

14. **test-strategy-014**: Contract Testing Pattern for Cross-Channel Inbound Messages
    - **Description**: OpenClaw uses a contract testing pattern that validates inbound message contexts across all supported channels (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Matrix, Teams, Zalo) against a shared set of structural invariants.
    - **Source**: test/inbound-contract.providers.test.ts, test/helpers/inbound-contract.ts
    - **Key Concepts**: contract testing, cross-channel validation, structural invariants, message normalization, data-driven tests
    - **Tags**: contract-testing, channels, message-normalization, data-driven, openclaw, mission-control-source

### Helpers & Best Practices (6 patterns)

15. **test-strategy-015**: withTempHome Higher-Order Test Helper for State Isolation
    - **Description**: OpenClaw provides a withTempHome() async helper that wraps test functions with a temporary HOME directory, custom environment variables, and automatic cleanup, supporting both simple isolation and complex multi-variable scenarios.
    - **Source**: test/helpers/temp-home.ts
    - **Key Concepts**: withTempHome, higher-order test helper, environment snapshot/restore, dynamic env values, cleanup retries
    - **Tags**: test-helpers, environment-isolation, higher-order-functions, cleanup, openclaw, mission-control-source

16. **test-strategy-016**: vi.resetModules Pattern for Dynamic Import Testing
    - **Description**: OpenClaw uses vi.resetModules() with dynamic imports to test module behavior with different environment variables, ensuring each test gets a fresh module instance.
    - **Source**: src/plugins/discovery.test.ts
    - **Key Concepts**: vi.resetModules, dynamic imports, module cache, environment-dependent modules, test isolation
    - **Tags**: module-mocking, dynamic-imports, environment-testing, vitest, openclaw, mission-control-source

17. **test-strategy-017**: Process Warning Filter for Clean Test Output
    - **Description**: OpenClaw installs a process warning filter at test setup time to suppress noisy deprecation and experimental warnings that would clutter test output.
    - **Source**: test/setup.ts, src/infra/warnings.ts
    - **Key Concepts**: warning suppression, clean test output, process warnings, setup file patterns
    - **Tags**: test-setup, warnings, clean-output, developer-experience, openclaw, mission-control-source

18. **test-strategy-018**: Plugin SDK Export Boundary Verification Test
    - **Description**: OpenClaw tests the plugin SDK's public API surface by verifying that internal runtime modules are NOT exposed through the plugin-sdk export, preventing plugins from accessing private implementation details.
    - **Source**: src/plugin-sdk/index.test.ts, src/plugin-sdk/index.ts
    - **Key Concepts**: api boundary testing, export verification, forbidden list, encapsulation testing, sdk surface area
    - **Tags**: api-boundary, encapsulation, sdk-testing, export-verification, openclaw, mission-control-source

19. **test-strategy-019**: Typed Mock Factories with Vitest vi.fn()
    - **Description**: OpenClaw uses typed vi.fn() mocks with explicit parameter and return types to create type-safe test doubles that catch API mismatches at compile time.
    - **Source**: test/auto-reply.retry.test.ts, src/plugins/voice-call.plugin.test.ts
    - **Key Concepts**: typed mocks, vi.fn generics, type-safe testing, Parameters utility type, ReturnType utility type
    - **Tags**: typescript, typed-mocks, type-safety, vitest, openclaw, mission-control-source

20. **test-strategy-020**: applyTestPluginDefaults for Automatic Plugin Disabling in Tests
    - **Description**: OpenClaw automatically disables plugins and the memory slot when running under Vitest, unless the test explicitly configures plugin behavior, preventing tests from accidentally loading real plugins.
    - **Source**: src/plugins/config-state.ts, src/plugins/config-state.test.ts
    - **Key Concepts**: test defaults, automatic disabling, VITEST detection, plugin isolation, opt-in testing
    - **Tags**: test-defaults, plugin-isolation, environment-detection, configuration, openclaw, mission-control-source

### Orchestration & Security (2 patterns)

21. **test-strategy-021**: Shell-Script Based Docker E2E Tests with Sequential Orchestration
    - **Description**: OpenClaw uses bash shell scripts under scripts/e2e/ to orchestrate Docker-based end-to-end tests, with a sequential chain ensuring cleanup runs after all test suites complete.
    - **Source**: package.json, Dockerfile.sandbox, Dockerfile.sandbox-browser
    - **Key Concepts**: shell script tests, docker orchestration, sequential chaining, cleanup handlers, model-specific variants
    - **Tags**: docker-testing, shell-scripts, e2e-orchestration, cleanup, openclaw, mission-control-source

22. **test-strategy-022**: Security-Focused Plugin Install Testing with Code Scanner Verification
    - **Description**: OpenClaw's plugin install tests verify that the security scanner detects dangerous code patterns in plugins and that installation continues with warnings rather than blocking.
    - **Source**: src/plugins/install.test.ts, src/security/skill-scanner.ts
    - **Key Concepts**: security scanning, warn-only policy, dangerous code detection, scanner resilience, code safety
    - **Tags**: security-testing, code-scanning, plugin-security, warn-only, openclaw, mission-control-source

---

## DAXIOM Storage Schema

### SQL INSERT Template

```sql
INSERT INTO tribal_intelligence.patterns (
    pattern_name,
    description,
    namespace,
    pattern_class,
    category,
    tier,
    confidence,
    tags,
    metadata,
    embedding
) VALUES (
    -- pattern_name (text, unique)
    'test-strategy-{001..022}',

    -- description (text, searchable)
    'Pattern description from above',

    -- namespace (text)
    'claude-flow',

    -- pattern_class (text)
    'test-strategy',

    -- category (text)
    'testing',

    -- tier (text)
    'hot',

    -- confidence (float)
    0.85,

    -- tags (text[])
    ARRAY['openclaw', 'mission-control-source', '...other tags'],

    -- metadata (jsonb)
    '{
        "task_type": "test_pattern_extraction",
        "source_repo": "openclaw/openclaw",
        "source_file": "...",
        "original_id": "openclaw-testing-{001..022}",
        "key_concepts": [...],
        "extracted_at": "2026-02-08T...",
        "test_frameworks": ["vitest"],
        "applicable_domains": ["openclaw", "claude-flow", "testing"]
    }'::jsonb,

    -- embedding (vector, 1536-dim)
    -- Generated via Gemini text-embedding-004
    -- Will be populated by embedding pipeline
    NULL
);
```

### Metadata Structure (JSONB)

Each pattern record includes comprehensive metadata for agent queries:

```json
{
  "task_type": "test_pattern_extraction",
  "source_repo": "openclaw/openclaw",
  "source_file": "vitest.config.ts",
  "original_id": "openclaw-testing-001",
  "key_concepts": [
    "vitest",
    "multi-config",
    "test-partitioning",
    "config-inheritance",
    "worker-pools",
    "forks-pool"
  ],
  "extracted_at": "2026-02-08T13:02:00.000Z",
  "test_frameworks": ["vitest"],
  "applicable_domains": ["openclaw", "claude-flow", "testing"],
  "adaptation_effort_hours": 2,
  "quick_wins": true,
  "related_patterns": [],
  "implementation_notes": "Can be adapted to claude-flow test suite"
}
```

---

## Embedding Strategy

### Model Selection
- **Primary**: Gemini `text-embedding-004` (1536-dim, latest)
- **Fallback**: `embedding-001` (1536-dim, if v1beta endpoint changes)
- **Optimization**: Batch process via RuBot server on `:3000`

### Embedding Pipeline
1. **Fetch** each pattern description from extracted JSON
2. **Generate** 1536-dim embedding via Gemini API
3. **Insert** into `tribal_intelligence.patterns` with metadata
4. **Index** via HNSW (m=16, ef_construction=100, cosine operator)
5. **Verify** via `hybrid_search()` queries

### Rate Limiting
- Gemini free tier: 100 req/min
- Implementation: 160ms delay between requests (safe margin)
- Batch size: Process all 22 patterns sequentially

### Cost Estimate
- Embedding cost: ~$0.002 per 1M tokens
- 22 patterns × ~200 tokens each ≈ 4.4K tokens = **negligible cost**

---

## Execution Steps

### Option 1: Via RuBot Server (Recommended)

```bash
# 1. SSH to DigitalOcean droplet
ssh user@146.190.74.86

# 2. Run RuBot with embedding task
cd /data/clawd/ruvbot
node scripts/embed-daxiom-patterns.js

# 3. Verify embeddings stored
psql -h localhost -U daxiom -d daxiom \
  -c "SELECT pattern_name, dimensions, confidence FROM tribal_intelligence.patterns WHERE pattern_class='test-strategy' ORDER BY pattern_name;"
```

### Option 2: Via Direct PostgreSQL

```bash
# Extract SQL statements and execute
cat << 'EOF' | psql -h 146.190.74.86 -U daxiom -d daxiom
-- Insert patterns and embed via stored procedure
SELECT embed_test_patterns('gemini-embedding-004');
EOF
```

### Option 3: Via Claude Flow CLI (Future)

```bash
npx claude-flow@v3alpha memory store \
  --key "daxiom-test-patterns" \
  --file patterns.json \
  --embed-model gemini-004 \
  --target tribal_intelligence.patterns
```

---

## Verification Queries

### Confirm all 22 patterns inserted

```sql
SELECT COUNT(*), AVG(confidence) as avg_confidence
FROM tribal_intelligence.patterns
WHERE pattern_class = 'test-strategy'
  AND namespace = 'claude-flow';
-- Expected: 22 | 0.85
```

### Test HNSW semantic search

```sql
SELECT
    pattern_name,
    description,
    similarity(embedding, (
        SELECT embedding FROM tribal_intelligence.patterns
        WHERE pattern_name = 'test-strategy-001'
    )) as similarity_score
FROM tribal_intelligence.patterns
WHERE pattern_class = 'test-strategy'
ORDER BY similarity DESC
LIMIT 5;
```

### Hybrid search (text + vector)

```sql
SELECT * FROM hybrid_search(
    query_text := 'vitest mocking strategies',
    query_embedding := (SELECT embedding FROM ...),
    namespace := 'claude-flow',
    limit := 10
);
```

---

## Integration with Claude-Flow Agents

### Post-Embedding Capabilities

Once patterns are embedded in DAXIOM, agents can:

1. **Pattern Discovery**: Semantic search for test strategies by intent
2. **Adaptive Testing**: Recommend patterns based on code context
3. **Test Generation**: Auto-generate tests using patterns as templates
4. **Pattern Scoring**: Rate pattern relevance with 4-factor formula
5. **Cross-Repository**: Reuse OpenClaw patterns in claude-flow projects

### Example Agent Query

```typescript
const results = await daxiomClient.search({
  type: 'semantic',
  query: 'How do I test async failures with vitest mocks?',
  namespace: 'claude-flow',
  patterns: ['test-strategy'],
  limit: 5,
  filters: {
    'metadata.test_frameworks': ['vitest'],
    'metadata.applicable_domains': 'claude-flow'
  }
});

// Returns: [test-strategy-013, test-strategy-007, test-strategy-019, ...]
```

---

## Metadata Tags Reference

### By Category
- `vitest` — Vitest framework patterns
- `test-configuration` — Config & setup patterns
- `test-partitioning` — Multi-tier test organization
- `mocking` — Test double strategies
- `port-management` — Port allocation patterns
- `e2e-testing` — End-to-end test patterns
- `docker` — Docker-based tests
- `test-helpers` — Helper utilities
- `security-testing` — Security scanning patterns
- `api-boundary` — API encapsulation tests

### By Complexity
- `quick-wins` — 1-2 hour adaptation effort (all patterns)
- `high-value` — Reusable across projects

### By Applicability
- `openclaw` — Source repository
- `mission-control-source` — Extracted for mission-control (claude-flow)
- `claude-flow` — Applicable to claude-flow projects

---

## Learnings & Next Steps

### Key Insights from OpenClaw Patterns
1. **Multi-tier testing**: Separate configs for unit/e2e/live dramatically improves CI speed
2. **Deterministic isolation**: Temp directories + port ranges prevent flaky parallel tests
3. **Type-safe mocks**: Typed vi.fn() catches API drift at compile time
4. **Contract testing**: Cross-channel validation ensures consistency
5. **Live test mode**: Isolated real API testing keeps integration tests clean

### Recommended Adaptations for Claude-Flow
1. Adopt multi-config vitest strategy for mission-control tests
2. Implement deterministic port allocation in agent test harness
3. Apply typed mocks pattern to all new test doubles
4. Use contract testing for multi-agent message validation
5. Enable live testing mode for real provider integrations

### Future Enhancements
- [ ] Auto-generate test scaffolds from DAXIOM patterns
- [ ] Build pattern-aware test linter
- [ ] Create pattern diff analyzer (when patterns change)
- [ ] Enable pattern-based code reviews ("use test-strategy-007 here")
- [ ] Export patterns as reusable npm package

---

**Last Updated**: 2026-02-08
**Status**: Ready for RuBot embedding pipeline
**Next**: Execute embedding via RuBot server or direct PostgreSQL insert
