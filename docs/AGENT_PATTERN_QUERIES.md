# Agent Pattern Queries - Test-Strategy Patterns in DAXIOM

**Purpose**: Enable claude-flow agents to discover and apply test-strategy patterns via semantic search
**Data Source**: DAXIOM `tribal_intelligence.patterns` (22 OpenClaw patterns)
**Query Interface**: Hybrid search (text + vector) via PostgreSQL / RuBot
**Integration**: Mission-control test generation, pattern recommendations, adaptive testing

---

## Quick-Start Query Examples

### 1. Find patterns for "vitest mocking" testing

```sql
-- Semantic search
SELECT
  pattern_name,
  description,
  tags,
  metadata->'test_frameworks' as frameworks,
  similarity(embedding, (
    SELECT embedding FROM tribal_intelligence.patterns
    WHERE pattern_name = 'test-strategy-007'
  )) as similarity_score
FROM tribal_intelligence.patterns
WHERE pattern_class = 'test-strategy'
  AND namespace = 'claude-flow'
ORDER BY similarity_score DESC
LIMIT 5;

-- Expected results:
-- 1. test-strategy-007 (Module-Level vi.mock)
-- 2. test-strategy-019 (Typed Mock Factories)
-- 3. test-strategy-008 (Inline Plugin API Stubbing)
-- 4. test-strategy-009 (Temporary Plugin Filesystem)
-- 5. test-strategy-005 (Plugin Registry Stubs)
```

### 2. Find patterns for "test isolation" testing

```sql
-- Text + vector hybrid search
SELECT
  pattern_name,
  description,
  tags,
  confidence,
  metadata->>'adaptation_effort_hours' as hours_to_adapt
FROM tribal_intelligence.patterns
WHERE pattern_class = 'test-strategy'
  AND namespace = 'claude-flow'
  AND (
    description ILIKE '%isolation%' OR
    description ILIKE '%isolate%' OR
    tags @> ARRAY['test-isolation']
  )
ORDER BY confidence DESC;

-- Expected results:
-- 1. test-strategy-004 (HOME Directory Sandboxing)
-- 2. test-strategy-015 (withTempHome Helper)
-- 3. test-strategy-006 (Port Block Allocation)
-- 4. test-strategy-012 (Live Test Mode)
-- 5. test-strategy-005 (Plugin Registry Stubs)
```

### 3. Find patterns for "e2e testing with docker"

```sql
-- Multi-tag search
SELECT
  pattern_name,
  description,
  tags,
  metadata->'key_concepts' as key_concepts
FROM tribal_intelligence.patterns
WHERE pattern_class = 'test-strategy'
  AND namespace = 'claude-flow'
  AND (
    tags @> ARRAY['docker'] OR
    tags @> ARRAY['e2e-testing']
  )
ORDER BY pattern_name;

-- Expected results:
-- 1. test-strategy-010 (Gateway Multi-Instance E2E)
-- 2. test-strategy-011 (Docker-Based E2E Suite)
-- 3. test-strategy-021 (Shell-Script Docker Tests)
```

### 4. Find patterns applicable to "mission-control"

```sql
-- Domain-specific search
SELECT
  pattern_name,
  description,
  metadata->>'adaptation_effort_hours' as effort_hours,
  metadata->'applicable_domains' as domains,
  tags
FROM tribal_intelligence.patterns
WHERE pattern_class = 'test-strategy'
  AND namespace = 'claude-flow'
  AND metadata->'applicable_domains' @> '"mission-control"'
ORDER BY confidence DESC;

-- Expected results: patterns #001, #002, #006, #010, #013, #014, #015, #020, #022
```

---

## Agent Integration Patterns

### Pattern 1: Automated Pattern Discovery

```typescript
// Agent discovers patterns for a code change
async function discoverPatternsForChange(codeContext: string): Promise<Pattern[]> {
  // Extract testing intent from code
  const intent = extractTestingIntent(codeContext);
  // "Need to test retry logic with async failures"

  // Query DAXIOM
  const results = await daxiomClient.search({
    type: 'semantic',
    query: intent,
    namespace: 'claude-flow',
    filters: {
      pattern_class: 'test-strategy',
    },
    limit: 5,
  });

  // Results: [test-strategy-013, test-strategy-006, test-strategy-003, ...]
  return results.patterns;
}

// Agent: "I recommend test-strategy-013 (Retry and Transient Failure Testing Pattern)
//         because you're testing async failures. See: [link to pattern]"
```

### Pattern 2: Test Scaffold Generation

```typescript
// Generate test scaffold from pattern
async function generateTestFromPattern(
  patternName: string,
  sourceFile: string,
): Promise<string> {
  // Fetch pattern from DAXIOM
  const pattern = await daxiomClient.getPattern(patternName);

  // Extract implementation template
  const template = extractTemplateFromDescription(pattern.description);

  // Adapt to source file context
  const adapted = adaptPatternToSource(template, sourceFile);

  // Generate test file
  return `
// Generated from ${patternName}
// See: DAXIOM_TEST_PATTERN_EMBEDDING.md

${adapted}
  `;
}
```

### Pattern 3: Pattern-Based Code Review

```typescript
// Review test code against patterns
async function reviewTestCode(testFileContent: string): Promise<Suggestion[]> {
  const suggestions = [];

  // Check for missing patterns
  if (testFileContent.includes('async') && !testFileContent.includes('mockRejectedValueOnce')) {
    const pattern = await daxiomClient.getPattern('test-strategy-013');
    suggestions.push({
      pattern: 'test-strategy-013',
      message: `Consider using ${pattern.title} for async failure handling`,
      severity: 'info',
    });
  }

  if (testFileContent.includes('spawn') && !testFileContent.includes('waitForPortOpen')) {
    const pattern = await daxiomClient.getPattern('test-strategy-010');
    suggestions.push({
      pattern: 'test-strategy-010',
      message: `Ensure port readiness checks as in ${pattern.title}`,
      severity: 'warn',
    });
  }

  return suggestions;
}
```

### Pattern 4: Cross-Pattern Dependency Detection

```typescript
// Find related patterns for a given pattern
async function findRelatedPatterns(
  patternName: string,
): Promise<Pattern[]> {
  const pattern = await daxiomClient.getPattern(patternName);

  // Find patterns with overlapping tags
  const related = await daxiomClient.search({
    type: 'semantic',
    query: pattern.description,
    namespace: 'claude-flow',
    filters: {
      pattern_class: 'test-strategy',
      'tags': { $intersects: pattern.tags },
    },
    limit: 5,
  });

  // E.g., test-strategy-013 related to:
  // → test-strategy-007 (similar mocking approach)
  // → test-strategy-010 (same e2e scope)
  // → test-strategy-015 (same helper pattern scope)

  return related.patterns;
}
```

---

## SQL Query Templates

### Search by Framework

```sql
-- Find all vitest patterns
SELECT pattern_name, title, description
FROM tribal_intelligence.patterns
WHERE pattern_class = 'test-strategy'
  AND metadata->'test_frameworks' @> '"vitest"'
ORDER BY pattern_name;
```

### Search by Effort Level

```sql
-- Find quick-win patterns (< 3 hours adaptation)
SELECT pattern_name, description, metadata->>'adaptation_effort_hours' as hours
FROM tribal_intelligence.patterns
WHERE pattern_class = 'test-strategy'
  AND (metadata->>'adaptation_effort_hours')::int <= 2
ORDER BY confidence DESC;
```

### Search by Key Concept

```sql
-- Find patterns about "mocking"
SELECT pattern_name, description
FROM tribal_intelligence.patterns
WHERE pattern_class = 'test-strategy'
  AND metadata->'key_concepts' @> '"mocking"'
ORDER BY pattern_name;

-- Find patterns about "port allocation"
SELECT pattern_name, description
FROM tribal_intelligence.patterns
WHERE pattern_class = 'test-strategy'
  AND metadata->'key_concepts' @> '"port allocation"'
ORDER BY pattern_name;
```

### Similarity Search

```sql
-- Find patterns similar to test-strategy-001
SELECT
  p1.pattern_name,
  p1.description,
  similarity(p1.embedding, p2.embedding) as sim_score
FROM tribal_intelligence.patterns p1
CROSS JOIN tribal_intelligence.patterns p2
WHERE p1.pattern_class = 'test-strategy'
  AND p2.pattern_name = 'test-strategy-001'
ORDER BY sim_score DESC
LIMIT 10;
```

### Hybrid Text + Vector Search

```sql
-- Search for patterns matching query + similar embeddings
SELECT
  pattern_name,
  description,
  similarity(embedding, (
    SELECT embedding FROM tribal_intelligence.patterns
    WHERE pattern_name = 'test-strategy-001'
  )) as sim_score,
  ts_rank(
    to_tsvector('english', description),
    plainto_tsquery('english', 'multi-config')
  ) as text_score
FROM tribal_intelligence.patterns
WHERE pattern_class = 'test-strategy'
  AND description @@ plainto_tsquery('english', 'multi-config')
ORDER BY (sim_score * 0.6 + text_score * 0.4) DESC
LIMIT 5;
```

---

## Integration with Mission-Control

### Query Patterns for Mission Test Generation

```typescript
// Mission-Control test agent discovers patterns
async function generateMissionControlTests(
  missionSpec: MissionSpec,
): Promise<TestFile[]> {
  // 1. Analyze mission spec
  const requirements = analyzeMissionRequirements(missionSpec);
  // "Multi-stage orchestration with failure recovery"

  // 2. Find relevant patterns
  const patterns = await discoverPatterns(requirements);
  // [test-strategy-001, test-strategy-002, test-strategy-013, test-strategy-014]

  // 3. Generate test scaffold
  const tests = patterns.map(p => generateTestFromPattern(p, missionSpec));

  // 4. Return generated test files
  return tests;
}
```

### Pattern Recommendations for New Agents

```typescript
// When adding new agent to mission-control, recommend test patterns
async function recommendPatternsForAgent(
  agentType: string,
): Promise<PatternRecommendation[]> {
  const recommendations: PatternRecommendation[] = [];

  switch (agentType) {
    case 'coordinator':
      recommendations.push(
        { pattern: 'test-strategy-001', reason: 'Multi-tier orchestration' },
        { pattern: 'test-strategy-014', reason: 'Contract testing for protocol' },
        { pattern: 'test-strategy-021', reason: 'Sequential orchestration' },
      );
      break;

    case 'researcher':
      recommendations.push(
        { pattern: 'test-strategy-013', reason: 'Transient API failures' },
        { pattern: 'test-strategy-012', reason: 'Live API key management' },
      );
      break;

    case 'executor':
      recommendations.push(
        { pattern: 'test-strategy-006', reason: 'Parallel execution isolation' },
        { pattern: 'test-strategy-010', reason: 'Multi-instance e2e tests' },
      );
      break;
  }

  return recommendations;
}
```

---

## Pattern Statistics & Heuristics

### By Test Scope

| Scope | Count | Pattern IDs |
|-------|-------|-----------|
| Unit | 8 | 007, 008, 013, 016, 017, 018, 019, 020 |
| Integration | 6 | 003, 005, 009, 014, 015 |
| E2E | 5 | 001, 002, 010, 011, 021 |
| Live | 2 | 012, 022 |

### By Framework

| Framework | Count | Pattern IDs |
|-----------|-------|-----------|
| Vitest | 18 | 001-020 (most patterns) |
| Docker | 3 | 011, 021 |
| Shell | 2 | 021 |

### Adaptation Difficulty Matrix

```
EASY (1-2h):
  - 007, 008, 013, 015, 019, 020 (mocking patterns)
  - 004, 005, 017 (isolation patterns)

MEDIUM (2-4h):
  - 001, 002, 003, 006, 016 (configuration patterns)
  - 014 (contract testing setup)

CHALLENGING (4h+):
  - 010, 011, 021 (e2e infrastructure)
  - 022 (security scanning integration)
```

---

## Example: Mission-Control Test Generation Workflow

### 1. Agent Request

```
Agent: "I need tests for the PatternScoringService with 4-factor scoring formula"
```

### 2. Pattern Discovery

```typescript
const patterns = await queryPatterns({
  intent: 'multi-factor scoring evaluation',
  frameworks: ['vitest'],
  limit: 5,
});

// Results:
// 1. test-strategy-019 (Typed Mock Factories) - for type-safe scoring unit tests
// 2. test-strategy-013 (Retry Pattern) - for failure handling in scoring
// 3. test-strategy-003 (V8 Coverage) - for coverage thresholds
// 4. test-strategy-014 (Contract Testing) - for scoring contract validation
```

### 3. Pattern Application

```typescript
// Generate test scaffold
const testTemplate = `
// Generated from test-strategy-019 (Typed Mock Factories)

describe('PatternScoringService', () => {
  // Type-safe mocks for scoring factor calculation
  const mockFactors = vi.fn<
    [factors: ScoringFactors],
    Promise<ScoringResult>
  >();

  // Each factor gets mocked independently
  const mockRelevanceCalculator = vi.fn<...>();
  const mockConfidenceCalculator = vi.fn<...>();
  const mockUsageFrequency = vi.fn<...>();
  const mockPerformanceScore = vi.fn<...>();

  it('combines four factors into final score', async () => {
    mockRelevanceCalculator.mockResolvedValueOnce(0.85);
    mockConfidenceCalculator.mockResolvedValueOnce(0.92);
    mockUsageFrequency.mockResolvedValueOnce(0.78);
    mockPerformanceScore.mockResolvedValueOnce(0.88);

    const result = await scoringService.calculateScore(pattern);
    expect(result.score).toBeCloseTo((0.85 + 0.92 + 0.78 + 0.88) / 4, 2);
  });

  // Retry pattern for transient scoring failures
  it('retries on transient evaluation failures', async () => {
    mockRelevanceCalculator.mockRejectedValueOnce(new Error('timeout'));
    mockRelevanceCalculator.mockResolvedValueOnce(0.85);

    const result = await scoringService.calculateScore(pattern);
    expect(mockRelevanceCalculator).toHaveBeenCalledTimes(2);
  });
});
`;
```

### 4. Test Execution

```bash
# Run generated tests with vitest
pnpm test PatternScoringService.test.ts

# Coverage report
pnpm test:coverage PatternScoringService.test.ts

# Results: 92% line coverage (meets tiered threshold)
```

---

## Maintenance & Evolution

### Adding New Patterns

When new test patterns are discovered:

```sql
-- Insert new pattern
INSERT INTO tribal_intelligence.patterns (
  pattern_name,
  description,
  namespace,
  pattern_class,
  category,
  tier,
  confidence,
  tags,
  metadata
) VALUES (
  'test-strategy-023',
  'New pattern description...',
  'claude-flow',
  'test-strategy',
  'testing',
  'hot',
  0.80,
  ARRAY['new-tag'],
  jsonb '{"task_type": "..."}'
);

-- Embed new vector
UPDATE tribal_intelligence.patterns
SET embedding = (SELECT embedding FROM gemini_embed('New pattern description...'))
WHERE pattern_name = 'test-strategy-023';

-- Create HNSW index if not exists
CREATE INDEX IF NOT EXISTS patterns_embedding_idx
ON tribal_intelligence.patterns USING hnsw (embedding vector_cosine_ops)
WITH (m=16, ef_construction=100);
```

### Pattern Deprecation

Mark patterns as deprecated when superseded:

```sql
UPDATE tribal_intelligence.patterns
SET metadata = jsonb_set(
  metadata,
  '{deprecated}',
  'true',
  true
)
WHERE pattern_name = 'test-strategy-OLD';

UPDATE tribal_intelligence.patterns
SET metadata = jsonb_set(
  metadata,
  '{superseded_by}',
  '"test-strategy-NEW"',
  true
)
WHERE pattern_name = 'test-strategy-OLD';
```

---

## References

- **Pattern Documentation**: `/docs/DAXIOM_TEST_PATTERN_EMBEDDING.md`
- **Pattern Summary**: `/docs/TEST_PATTERN_EXTRACTION_SUMMARY.md`
- **Embedding Script**: `/scripts/embed-daxiom-patterns.js`
- **OpenClaw Source**: https://github.com/openclaw/openclaw

---

**Last Updated**: 2026-02-08
**Pattern Count**: 22 active patterns
**Query Interface**: PostgreSQL HNSW + hybrid search
**Integration Status**: Ready for agent queries

