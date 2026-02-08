# Phase 2: Semantic Routing Architecture Outline

**Document ID:** PHASE2-ARCH-001
**Created:** 2026-02-08
**Status:** COMPLETE - Implementation Ready
**Companion Documents:**
- PHASE2_ROUTING_SPEC.md (Requirements & Pseudocode)
- PHASE2_ROUTING_ALGORITHMS.md (Detailed Algorithms)

---

## Executive Summary

This document outlines the system architecture for Phase 2 semantic routing. It specifies:
1. Core service components and responsibilities
2. Data flow through the system
3. Internal communication patterns
4. Caching strategies
5. External dependencies
6. Implementation patterns

---

## System Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         API LAYER                                  │
├────────────────────────────────────────────────────────────────────┤
│  • POST /api/patterns/route                                        │
│  • GET /api/agents/profiles                                        │
│  • POST /api/routing/metrics                                       │
└────────┬───────────────────────────────────────────────────────────┘
         │
┌────────▼───────────────────────────────────────────────────────────┐
│              ORCHESTRATION LAYER (Request Handler)                 │
├────────────────────────────────────────────────────────────────────┤
│  • Input validation (Zod schemas)                                  │
│  • Context assembly                                                │
│  • Error handling + circuit breaker                                │
│  • Request logging                                                 │
└────────┬───────────────────────────────────────────────────────────┘
         │
┌────────▼───────────────────────────────────────────────────────────┐
│         SEMANTIC ROUTING SERVICE (Core Logic)                      │
├────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ SemanticRoutingService (Coordinator)                        │  │
│  │ • Orchestrate 15-phase routing algorithm                    │  │
│  │ • Manage latency budget (100ms p99)                         │  │
│  │ • Coordinate subservices                                    │  │
│  │ • Logging + metrics collection                              │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────┬──────────────────┬──────────────────────┐   │
│  │ Embedding        │ HNSW Index       │ Profile              │   │
│  │ Service          │ Service          │ Matcher              │   │
│  ├──────────────────┼──────────────────┼──────────────────────┤   │
│  │ • Generate 1536d │ • Search top-10  │ • Load profiles      │   │
│  │   embeddings     │ • Cosine sim     │ • Metadata matching  │   │
│  │ • Gemini API     │ • m=16, ef=40    │ • Constraint filter  │   │
│  │ • Cache (TTL=1h) │ • <10ms p99      │ • Cache (TTL=5min)   │   │
│  └──────────────────┴──────────────────┴──────────────────────┘   │
│                                                                    │
│  ┌──────────────────┬──────────────────┬──────────────────────┐   │
│  │ Scoring Engine   │ Confidence       │ Byzantine            │   │
│  │                  │ Calibration      │ Consensus            │   │
│  ├──────────────────┼──────────────────┼──────────────────────┤   │
│  │ • 8-expert MoE   │ • Score gap      │ • 5 validators       │   │
│  │ • Weights        │ • Entropy        │ • 3-of-5 required    │   │
│  │ • Normalized     │ • Accuracy       │ • <50ms timeout      │   │
│  │ • Deterministic  │ • Calibration    │ • Parallel execution │   │
│  └──────────────────┴──────────────────┴──────────────────────┘   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Fallback Strategy Manager                                    │ │
│  │ (alternatives → skill_match → history → round_robin → error) │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │ Decision Builder & Logger                                    │ │
│  │ • Construct RoutingDecision object                           │ │
│  │ • Build reasoning string                                     │ │
│  │ • Log to audit trail                                         │ │
│  │ • Cache decision (TTL=5min)                                  │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────┬───────────────────────────────────────────────────────────┘
         │
┌────────▼───────────────────────────────────────────────────────────┐
│           DATA ACCESS LAYER (Repositories)                         │
├────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┬──────────────────┬──────────────────────┐   │
│  │ Agent Profile    │ Pattern History  │ Metrics Store        │   │
│  │ Repository       │ Repository       │ Repository           │   │
│  ├──────────────────┼──────────────────┼──────────────────────┤   │
│  │ • Load by ID     │ • Query by       │ • Store decisions    │   │
│  │ • Batch load     │   pattern type   │ • Fetch for         │   │
│  │ • Update on exec │ • Get recent     │   calibration        │   │
│  │ • Version track  │   outcomes       │ • Trending queries   │   │
│  │ • Cache L1+L2    │ • Cache          │ • Cache              │   │
│  └──────────────────┴──────────────────┴──────────────────────┘   │
└────────┬───────────────────────────────────────────────────────────┘
         │
┌────────▼───────────────────────────────────────────────────────────┐
│         PERSISTENCE & EXTERNAL SERVICES                            │
├────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┬──────────────────┬──────────────────────┐   │
│  │ PostgreSQL DB    │ Gemini API       │ Redis Cache          │   │
│  │ (RuVector)       │                  │                      │   │
│  ├──────────────────┼──────────────────┼──────────────────────┤   │
│  │ • Agent profiles │ • Embed patterns │ • L1 cache (fast)    │   │
│  │ • Pattern history│ • 1536-dim       │ • TTL support        │   │
│  │ • Metrics logs   │ • Rate limit:    │ • Connection pool    │   │
│  │ • HNSW index    │   100 req/min    │ • Atomic ops         │   │
│  └──────────────────┴──────────────────┴──────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. SemanticRoutingService (Main Orchestrator)

**Responsibility:** Coordinate the entire routing algorithm from request to decision

**Public Interface:**
```typescript
class SemanticRoutingService {
  // Main routing entry point
  async route(
    patternRequest: PatternRoutingRequest,
    executionContext: ExecutionContext,
    constraints?: RoutingConstraints
  ): Promise<RoutingDecision>

  // Metrics tracking
  async updateMetrics(
    decision: RoutingDecision,
    feedback: RoutingFeedback
  ): Promise<void>

  // Statistics
  getRouteLatencyStats(): LatencyStats
  getRouteAccuracyStats(): AccuracyStats
  getRouteCoverageStats(): CoverageStats
}
```

**Internal State:**
- Request context (timing, logging)
- Component registry (references to all subservices)
- Metrics accumulator (latency, success, errors)
- Configuration (weights, thresholds, timeouts)

**Dependencies:**
- EmbeddingService
- HNSWIndexService
- AgentCapabilityMatcher
- RoutingDecisionEngine
- MetricsStore

**Error Handling:**
- Validation errors → 400 Bad Request
- Embedding failures → fallback to metadata routing
- HNSW failures → metadata fallback
- Consensus failures → apply fallback strategy
- Database errors → circuit breaker + cached fallback

---

### 2. EmbeddingService

**Responsibility:** Generate and cache pattern embeddings

**Public Interface:**
```typescript
class EmbeddingService {
  // Generate 1536-dim embedding for pattern
  async embedPattern(
    query: string,
    metadata: Record<string, string>
  ): Promise<number[]>

  // Generate embedding for agent capabilities
  async embedAgentCapabilities(agent: AgentCapabilityProfile): Promise<number[]>

  // Clear cache
  invalidateCache(key: string): void
}
```

**Caching Strategy:**
- **L1 Cache (Redis):** 1 hour TTL, 100MB limit
- **L2 Cache (Memory):** 5 minutes TTL, 50MB limit
- **Cache Key:** SHA256(query + sorted metadata)
- **Hit Rate Target:** >90%

**External Service:** Gemini Embedding API
- Rate limit: 100 requests/minute
- Backoff strategy: exponential (160ms base + jitter)
- Timeout: 30 seconds with fallback to metadata routing
- Dimension: 1536
- Normalization: L2 norm verification

**Error Handling:**
- Rate limit → queue + exponential backoff
- Timeout → fallback to metadata routing
- API error → log + fallback to metadata routing
- Invalid dimension → reject + log error

---

### 3. HNSWIndexService

**Responsibility:** Manage HNSW vector similarity search

**Public Interface:**
```typescript
class HNSWIndexService {
  // Search for similar agents
  async search(
    queryVector: number[],
    topK: number,
    efSearch: number
  ): Promise<Array<{agent_id: string, similarity: number}>>

  // Update index with new agent capability
  async updateIndex(
    agentId: string,
    capabilityVector: number[]
  ): Promise<void>

  // Rebuild entire index (maintenance)
  async rebuildIndex(): Promise<void>

  // Get index statistics
  getIndexStats(): IndexStats
}
```

**Index Configuration:**
- **Type:** HNSW (Hierarchical Navigable Small World)
- **Dimension:** 1536
- **m (connections):** 16
- **ef_construction:** 100
- **ef_search:** 40 (tunable)
- **Distance metric:** cosine similarity
- **Database:** PostgreSQL with RuVector extension

**Index Performance:**
- Search latency: <10ms p99 for 100-1000 patterns
- Index size: ~1.2GB for 10,000 patterns
- Build time: ~1 second for 10,000 patterns
- Update time: <50ms per agent

**Error Handling:**
- Index not found → metadata fallback search
- Index corruption → rebuild index (async, notify operators)
- Search timeout (>10ms) → return cached results or fallback
- Invalid vector → skip agent or use previous embedding

---

### 4. AgentCapabilityMatcher

**Responsibility:** Load agent profiles and perform constraint/metadata matching

**Public Interface:**
```typescript
class AgentCapabilityMatcher {
  // Load single profile
  async loadProfile(agentId: string): Promise<AgentCapabilityProfile>

  // Batch load profiles
  async batchLoadProfiles(agentIds: string[]): Promise<AgentCapabilityProfile[]>

  // Find agents by skills
  async findBySkills(
    skills: string[],
    exactMatch?: boolean
  ): Promise<AgentCapabilityProfile[]>

  // Apply routing constraints
  filterByConstraints(
    agents: AgentCapabilityProfile[],
    constraints: RoutingConstraints
  ): AgentCapabilityProfile[]

  // Update profile after execution
  async updateProfile(profile: AgentCapabilityProfile): Promise<void>

  // Get profile version
  getProfileVersion(agentId: string): number
}
```

**Profile Caching:**
- **L1 Cache (Redis):** 5 minutes TTL
- **L2 Cache (Memory):** 2 minutes TTL
- **Cache Key:** "agent:" + agent_id
- **Invalidation:** on update, timestamp-based expiration
- **Batch TTL:** Reduce by 50% if batch operation

**Metadata Matching:**
- Exact match: skill in agent.skills
- Prefix match: skill.startswith(agent_skill)
- Fuzzy match: Levenshtein distance <2
- Scoring: exact=1.0, prefix=0.8, fuzzy=0.5

**Constraint Filtering:**
- max_latency_ms: agent.latency_p99 ≤ max_latency
- required_security_level: agent.security_level ≥ required
- require_consensus: flag for later validation
- skill_constraints: all required skills present

---

### 5. RoutingDecisionEngine

**Responsibility:** Multi-criteria scoring with Byzantine consensus

**Public Interface:**
```typescript
class RoutingDecisionEngine {
  // Score single agent
  scoreAgent(
    agent: AgentCapabilityProfile,
    pattern: PatternRoutingRequest,
    context: ExecutionContext
  ): number

  // Score all eligible agents
  scoreAllAgents(
    agents: AgentCapabilityProfile[],
    pattern: PatternRoutingRequest,
    context: ExecutionContext
  ): Record<string, number>

  // Compute confidence
  calibrateConfidence(
    primaryScore: number,
    secondaryScore: number,
    consensusValidatorsAgreed: number,
    pattern: PatternRoutingRequest,
    context: ExecutionContext
  ): number

  // Byzantine consensus
  async validateByzantine(
    primaryAgent: AgentCapabilityProfile,
    alternatives: AgentCapabilityProfile[],
    pattern: PatternRoutingRequest,
    context: ExecutionContext
  ): Promise<"APPROVE" | "ESCALATE" | "TIMEOUT" | "ERROR">

  // Apply fallback
  async applyFallback(
    pattern: PatternRoutingRequest,
    context: ExecutionContext,
    reason: string
  ): Promise<RoutingDecision>
}
```

**Expert Functions (8):**
1. expert_similarity (25%): HNSW cosine distance
2. expert_metadata (15%): Skill/specialization matching
3. expert_success_rate (20%): Historical success for pattern type
4. expert_recency (10%): Recent wins boost
5. expert_team_diversity (10%): Load balancing + diversity
6. expert_latency_fit (10%): Priority-aware latency matching
7. expert_context_relevance (7%): User/time/session factors
8. expert_confidence_calibration (3%): Accuracy history

**Byzantine Consensus:**
- 5 parallel validators with 50ms timeout
- 3 of 5 required for approval
- Validators: similarity, success_rate, capability_match, context, diversity
- Disagreement triggers fallback

**Fallback Chain:**
1. alternatives (use top-3 from primary routing)
2. skill_match (find agents with required skills)
3. success_history (best historical agent for pattern type)
4. round_robin (load balance across available)
5. default_agent (designated fallback)
6. error (return error)

---

### 6. Decision Builder

**Responsibility:** Construct routing decision with reasoning and logging

**Public Interface:**
```typescript
class DecisionBuilder {
  // Build complete decision object
  buildDecision(
    primaryAgent: AgentCapabilityProfile,
    alternatives: AgentCapabilityProfile[],
    scores: Record<string, number>,
    confidence: number,
    pattern: PatternRoutingRequest,
    context: ExecutionContext
  ): RoutingDecision

  // Build reasoning explanation
  buildReasoning(
    primaryAgent: AgentCapabilityProfile,
    scores: Record<string, number>,
    pattern: PatternRoutingRequest
  ): string

  // Build scoring breakdown (if requested)
  buildScoringBreakdown(
    agent: AgentCapabilityProfile,
    experts: Record<string, number>
  ): ScoringBreakdown
}
```

**Reasoning Generation:**
- Agent selection rationale
- Score gap analysis
- Success rate highlights
- Skill matching summary
- Confidence assessment
- Alternative explanations

---

### 7. MetricsStore

**Responsibility:** Store and query routing metrics

**Public Interface:**
```typescript
class MetricsStore {
  // Record routing decision
  async recordDecision(decision: RoutingDecision): Promise<void>

  // Record execution feedback
  async recordFeedback(
    decisionId: string,
    feedback: RoutingFeedback
  ): Promise<void>

  // Query latency stats
  getLatencyStats(windowMinutes?: number): LatencyStats

  // Query accuracy stats
  getAccuracyStats(windowMinutes?: number): AccuracyStats

  // Query coverage stats
  getCoverageStats(windowMinutes?: number): CoverageStats

  // Query per-agent metrics
  getAgentMetrics(agentId: string): AgentMetrics
}
```

**Metrics Collected:**
- Decision ID, timestamp, request ID
- Primary agent, score, confidence
- Alternatives, scores, ranks
- Latency breakdown (embedding, HNSW, scoring, consensus, etc)
- Cache hits/misses
- Execution outcome
- User feedback

**Retention Policy:**
- Hot data: Last 24 hours in Redis
- Warm data: Last 30 days in PostgreSQL
- Archive: >30 days in cold storage

---

## Data Flow Diagrams

### Complete Routing Flow

```
REQUEST
  │
  ▼
[Request Validation]
  │ ├─ Validate pattern_query length
  │ ├─ Validate metadata structure
  │ └─ Validate constraints
  │
  ▼
[Cache Lookup]
  │ ├─ Compute cache key from pattern + context
  │ ├─ Check Redis
  │ ├─ Check Memory
  │ └─ If HIT → Skip to Response
  │
  ▼
[Embedding Generation] <20ms
  │ ├─ Check cache first
  │ ├─ If MISS → Call Gemini API
  │ │ ├─ Construct input with metadata
  │ │ ├─ Rate limit: 100 req/min
  │ │ ├─ Timeout: 30s → fallback to metadata
  │ │ └─ Verify 1536 dimensions
  │ ├─ Cache result (TTL=1h)
  │ └─ Handle errors → fallback to metadata routing
  │
  ▼
[HNSW Similarity Search] <10ms
  │ ├─ Query PostgreSQL HNSW index
  │ ├─ top_k = 10
  │ ├─ ef_search = 40
  │ ├─ Get (agent_id, similarity) pairs
  │ ├─ Filter by similarity > 0.1
  │ ├─ Handle index not found → metadata fallback
  │ └─ Handle corruption → rebuild (async)
  │
  ▼
[Load Agent Profiles] ~5ms
  │ ├─ Extract agent IDs from candidates
  │ ├─ Batch load from cache/DB
  │ ├─ Cache profiles (TTL=5min)
  │ └─ Supplement with similarity scores
  │
  ▼
[Apply Constraints & Filter]
  │ ├─ Exclude users' excluded_agents
  │ ├─ Check max_latency_ms
  │ ├─ Check required_security_level
  │ ├─ Verify skill_constraints met
  │ └─ If no agents → Apply fallback
  │
  ▼
[Multi-Criteria Scoring] <15ms
  │
  ├─ For each eligible agent:
  │
  │ ├─ Expert 1: SIMILARITY
  │ │ └─ Normalize HNSW score / max
  │ │
  │ ├─ Expert 2: METADATA
  │ │ └─ Skill + specialization matching
  │ │
  │ ├─ Expert 3: SUCCESS_RATE
  │ │ └─ Historical success for pattern type
  │ │
  │ ├─ Expert 4: RECENCY
  │ │ └─ Boost for recent wins (<1h)
  │ │
  │ ├─ Expert 5: TEAM_DIVERSITY
  │ │ ├─ Penalize if already assigned
  │ │ ├─ Penalize if high load (>80%)
  │ │ └─ Bonus if low load (<30%)
  │ │
  │ ├─ Expert 6: LATENCY_FIT
  │ │ └─ Match to priority (critical→high)
  │ │
  │ ├─ Expert 7: CONTEXT_RELEVANCE
  │ │ └─ User prefs, historical success, time
  │ │
  │ └─ Expert 8: CONFIDENCE_CALIBRATION
  │   └─ Recent accuracy factor
  │
  │ Final Score = ∑(expert_score × weight)
  │ Weights sum to 1.0
  │
  ▼
[Rank Agents]
  │ ├─ Sort by score DESC
  │ ├─ Primary = ranked[0]
  │ ├─ Alternatives = ranked[1:3]
  │ └─ Verify primary.score exists
  │
  ▼
[Byzantine Consensus?]
  │ IF required OR critical_pattern:
  │ │
  │ ├─ Validator 1: Semantic Similarity
  │ ├─ Validator 2: Success Rate
  │ ├─ Validator 3: Capability Match
  │ ├─ Validator 4: Context Relevance
  │ ├─ Validator 5: Team Diversity
  │ │
  │ ├─ Parallel execution
  │ ├─ Timeout: 50ms
  │ ├─ Require: 3 of 5 agreement
  │ │
  │ ├─ APPROVE → Continue
  │ ├─ ESCALATE → Apply fallback
  │ └─ TIMEOUT → Use primary
  │
  ▼
[Confidence Calibration]
  │ ├─ Base: Score gap (primary - secondary)
  │ ├─ Uncertainty: Entropy penalty
  │ ├─ Consensus: Validator agreement bonus
  │ ├─ Calibration: Recent accuracy factor
  │ ├─ Pattern uncertainty: Execution history
  │ │
  │ └─ Final: [0, 1] ∈ range
  │
  ▼
[Build Reasoning]
  │ ├─ Agent selection
  │ ├─ Score gap analysis
  │ ├─ Success rate highlights
  │ ├─ Skill matching summary
  │ └─ Confidence assessment
  │
  ▼
[Build Decision Object]
  │ ├─ decision_id = UUID
  │ ├─ primary_agent = {id, name, score}
  │ ├─ alternatives = [{id, score, rank}, ...]
  │ ├─ confidence_score = [0, 1]
  │ ├─ reasoning = string
  │ ├─ scoring_breakdown = {expert_1, ..., expert_8}
  │ ├─ consensus = {required, agreed, result}
  │ └─ audit = {user_id, timestamp, context}
  │
  ▼
[Log & Cache]
  │ ├─ Write to audit trail
  │ ├─ Cache decision (TTL=5min)
  │ └─ Increment latency metrics
  │
  ▼
RESPONSE (200 OK)
  └─ RoutingDecision + latency_ms
```

---

### Agent Profile Update Flow

```
EXECUTION COMPLETE
  │
  ├─ agent_id, pattern_id, pattern_type, success, latency_ms
  │
  ▼
[Load Current Profile]
  │ ├─ Check cache (TTL=5min)
  │ ├─ If MISS → Load from DB
  │ └─ Cache result
  │
  ▼
[Update Success Rate]
  │ ├─ Get current: success_rate_by_type[pattern_type]
  │ ├─ Compute EMA: 0.9 × old + 0.1 × outcome
  │ └─ Update profile.success_rate_by_type[pattern_type]
  │
  ▼
[Update Recent Wins]
  │ ├─ Insert: {pattern_id, pattern_type, timestamp, success}
  │ ├─ Keep: Last 10 entries (LIFO)
  │ └─ Discard: Older entries
  │
  ▼
[Update Latency Profile]
  │ ├─ Add new_sample to rolling window
  │ ├─ Compute: p50, p95, p99
  │ ├─ Keep: Last 100 samples
  │ └─ Update profile.latency_profile
  │
  ▼
[Check Consecutive Failures]
  │ ├─ Count failures for this agent in last hour
  │ │
  │ ├─ IF >3 consecutive:
  │ │ ├─ Set is_available = false
  │ │ ├─ Set unavailable_until = now() + 300s
  │ │ └─ Set unavailability_reason
  │ │
  │ └─ ELSE:
  │   └─ Set is_available = true
  │
  ▼
[Update Timestamps]
  │ ├─ updated_at = now()
  │ └─ last_executed_at = now()
  │
  ▼
[Persist to Database]
  │ ├─ SQL: INSERT OR UPDATE agent_capability_profiles
  │ └─ Include: All updated fields
  │
  ▼
[Invalidate Cache]
  │ ├─ Key: "agent:" + agent_id
  │ ├─ Clear from Redis
  │ └─ Clear from Memory
  │
  ▼
[Log Profile Update]
  │
  └─ Record: agent_id, pattern_type, success, timestamp
```

---

## Caching Strategy

### Cache Layer Architecture

```
┌─────────────────────────────────────┐
│  REQUEST                            │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  L1 CACHE (In-Memory)              │
├─────────────────────────────────────┤
│  • Hit Rate: ~80%                   │
│  • TTL: 2-5 minutes                 │
│  • Size: 50MB limit                 │
│  • Eviction: LRU                    │
│  • Thread-safe: Yes                 │
│  Keys:                              │
│  - embedding:query:<hash>           │
│  - agent:<agent_id>                 │
│  - decision:<decision_id>           │
│  - experts:<agent_id>               │
└────────────┬────────────────────────┘
             │ (MISS)
             ▼
┌─────────────────────────────────────┐
│  L2 CACHE (Redis)                   │
├─────────────────────────────────────┤
│  • Hit Rate: ~95%                   │
│  • TTL: 1 hour (embeddings)         │
│  •      5 min (decisions)           │
│  • Size: 500MB limit                │
│  • Eviction: Configurable           │
│  • Connection Pool: 50+             │
│  • Atomic: Yes                      │
└────────────┬────────────────────────┘
             │ (MISS)
             ▼
┌─────────────────────────────────────┐
│  DATABASE (PostgreSQL)              │
├─────────────────────────────────────┤
│  • HNSW Index: 1-2GB                │
│  • Agent Profiles: Latest           │
│  • Metrics: Complete history        │
│  • Latency: 5-20ms                  │
└─────────────────────────────────────┘
```

### Cache Hit Rates (Targets)

| Cache Type | Target Hit Rate | TTL | Size Limit |
|-----------|-----------------|-----|-----------|
| L1 (Memory) | 80% | 2-5 min | 50 MB |
| L2 (Redis) | 95% | 1h (embed), 5m (decision) | 500 MB |
| Total System | 98% | — | — |

### Cache Invalidation Strategies

**Embedding Cache:**
- TTL: 1 hour (patterns rarely change)
- Invalidate on: pattern metadata update
- Strategy: Time-based expiration + manual invalidation

**Agent Profile Cache:**
- TTL: 5 minutes
- Invalidate on: execution completion, profile update
- Strategy: Event-driven + time-based

**Decision Cache:**
- TTL: 5 minutes
- Invalidate on: cache full, manual flush
- Strategy: LRU eviction + explicit clear

**HNSW Index:**
- Persistent in PostgreSQL
- No TTL (always fresh from DB)
- Rebuild: Nightly or on corruption

---

## Implementation Patterns

### Pattern 1: Circuit Breaker for External Services

```
REQUEST
  │
  ├─ Check circuit status
  │ ├─ OPEN → Return cached fallback
  │ ├─ HALF_OPEN → Try request (limited)
  │ └─ CLOSED → Execute request
  │
  ├─ Success → Reset count, return result
  │
  └─ Failure
    ├─ Increment failure count
    ├─ IF failures > threshold
    │ └─ Open circuit + start timeout
    └─ Return cached fallback
```

**Example:** Gemini API circuit breaker
- Threshold: 5 failures in 60 seconds
- Timeout: 30 seconds (then HALF_OPEN)
- Fallback: Use metadata-only routing

### Pattern 2: Exponential Backoff for Rate Limiting

```
REQUEST (rate limited)
  │
  ├─ base_delay = 160ms (to stay <100 req/min)
  ├─ jitter = random(0, base_delay/10)
  ├─ delay = base_delay + jitter + (attempt * base_delay)
  │ (attempt 1 → 160ms, attempt 2 → 320ms, etc)
  │
  ├─ Wait(delay)
  ├─ Retry (max 3 attempts)
  │
  └─ If all fail → fallback to metadata routing
```

### Pattern 3: Latency Budget Tracking

```
START: latency_budget = 100ms

Phase 1: Validation     → use  5ms (95 remaining)
Phase 2: Cache lookup   → use  2ms (93 remaining)
Phase 3: Embedding      → use 20ms (73 remaining)
Phase 4: HNSW search    → use  8ms (65 remaining)
Phase 5: Profile load   → use  5ms (60 remaining)
Phase 6: Filtering      → use  3ms (57 remaining)
Phase 7: Scoring        → use 15ms (42 remaining)
Phase 8: Ranking        → use  1ms (41 remaining)
Phase 9: Consensus      → use 25ms (16 remaining)
Phase 10: Confidence    → use  3ms (13 remaining)
Phase 11-15: Build+Log  → use 10ms (3 remaining) ✓

Total: 97ms (within 100ms SLA)

If phase exceeds budget:
  ├─ Log warning
  ├─ Skip optional phases
  └─ Continue with critical path
```

---

## External Dependencies

### 1. PostgreSQL + RuVector Extension
**Purpose:** Agent profiles, metrics, HNSW index
**Version:** PostgreSQL 14+, RuVector 2.0.1+
**Requirements:**
- 384-dim embeddings (local), 1536-dim (DAXIOM)
- HNSW index on capability_embedding column
- Connection pool: 50+ connections

### 2. Gemini Embedding API
**Purpose:** Generate 1536-dimensional pattern embeddings
**Rate Limit:** 100 requests/minute
**Backoff:** Exponential (160ms base)
**Timeout:** 30 seconds
**Fallback:** Metadata-only routing

### 3. Redis Cache
**Purpose:** L2 caching for embeddings, profiles, decisions
**Version:** 6.0+
**Configuration:**
- 500MB max memory
- LRU eviction policy
- Connection pool: 50+ connections
- TTL support: Required

---

## Error Handling

### Error Propagation

```
Application Layer
    │
    ├─ ValidationError
    │   └─ 400 Bad Request
    │
    ├─ EmbeddingError (non-fatal)
    │   └─ Fallback to metadata routing
    │
    ├─ DatabaseError (fatal)
    │   └─ Circuit breaker → 503 Service Unavailable
    │
    ├─ TimeoutError (fatal)
    │   └─ 504 Gateway Timeout
    │
    ├─ NoAgentsAvailableError
    │   └─ 503 Service Unavailable
    │
    └─ UnexpectedError
        └─ 500 Internal Server Error
```

### Error Logging

All errors logged with:
- error code (e.g., "EMBEDDING_FAILED")
- request_id (for tracing)
- user_id (for debugging)
- timestamp
- stack trace (if applicable)
- context (partial context safe to log)

---

## Performance Monitoring

### Key Metrics

1. **Latency (p99):** <100ms routing decision
2. **Accuracy:** 99%+ correct agent selection
3. **Coverage:** 95%+ of patterns routable
4. **Cache Hit Rate:** >95% combined L1+L2
5. **Fallback Rate:** <5% requiring fallback strategy
6. **Consensus Time:** <30ms when required
7. **Throughput:** 1000+ decisions/minute

### Metrics Collection Points

- Request entry/exit (end-to-end latency)
- Each phase entry/exit (phase timing)
- Cache hits/misses
- Expert score computation
- Consensus validation
- Fallback activation
- Error rates by type
- Agent selection accuracy (post-execution)

---

## Security Considerations

### Data Privacy
- No sensitive user data in logs
- No patterns in error messages
- Audit trail protected (RLS enforced)
- Metrics encrypted at rest

### Input Validation
- Zod schemas on all requests
- Length limits enforced
- Character set validation
- No script injection vectors

### Access Control
- JWT authentication required
- RLS on all database queries
- API key rotation supported
- Rate limiting per user

---

## Deployment & Operations

### Deployment Steps

1. **Database Preparation**
   - Create tables (if not exist)
   - Build HNSW index
   - Load initial agent profiles

2. **Service Startup**
   - Initialize Redis pool
   - Connect to Postgres
   - Load configuration
   - Verify external services (Gemini API)

3. **Health Checks**
   - Database connectivity
   - Redis connectivity
   - Gemini API reachability
   - HNSW index integrity

4. **Gradual Rollout**
   - Start with 10% traffic
   - Monitor metrics
   - Increase to 100%

### Operational Runbooks

**High Latency Alert:**
1. Check embedding API rate limits
2. Check Redis memory usage
3. Check database query performance
4. Check HNSW index health
5. Consider increasing timeouts or caching

**Low Accuracy Alert:**
1. Check expert weight distribution
2. Check calibration factors
3. Check agent profile freshness
4. Review recent pattern types
5. Consider retraining confidence model

**Circuit Breaker Open:**
1. Check external service status
2. Wait for circuit to reset
3. Monitor retry attempts
4. If persistent, escalate to service owner

---

## Testing Strategy

### Unit Tests (60% coverage)
- Expert scoring functions
- Confidence calibration
- Fallback strategies
- Validation schemas
- Cache operations

### Integration Tests (30% coverage)
- Full routing flow (mock agents)
- Byzantine consensus validation
- Database operations
- Cache invalidation
- Fallback chains

### End-to-End Tests (10% coverage)
- Complete routing with real agents
- Latency validation
- Accuracy measurement
- Error recovery

### Load Tests
- 1000+ concurrent requests
- Sustained throughput 500+ decisions/min
- Cache hit rate verification
- Latency distribution analysis

---

## Future Extensions

### Phase 2.1: Personalization
- User preference learning
- Agent recommendation history
- Success pattern detection

### Phase 2.2: Dynamic Weighting
- Adaptive expert weights
- ML-based calibration
- Pattern-specific tuning

### Phase 2.3: Agent Marketplace
- Agent reputation system
- Cost-aware routing
- Multi-objective optimization

### Phase 2.4: Distributed Consensus
- Distributed Byzantine consensus
- Cross-region routing decisions
- Geo-aware optimization

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-08 | Initial architecture outline |

---

**End of Architecture Document**

This outline provides implementers with clear component design, data flows, and operational guidance for Phase 2 routing system.
