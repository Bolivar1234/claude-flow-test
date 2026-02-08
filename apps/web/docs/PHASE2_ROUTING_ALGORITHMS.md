# Phase 2: Semantic Routing Algorithms - Detailed Pseudocode

**Document ID:** PHASE2-ALGO-001
**Created:** 2026-02-08
**Status:** COMPLETE - Implementation Ready
**Companion Document:** PHASE2_ROUTING_SPEC.md

This document contains detailed, implementation-ready pseudocode for all routing algorithms specified in PHASE2_ROUTING_SPEC.md.

---

## Table of Contents

1. [Core Semantic Routing Algorithm](#1-core-semantic-routing-algorithm)
2. [Multi-Criteria Scoring with 8 Experts](#2-multi-criteria-scoring-with-8-experts)
3. [Individual Expert Functions](#3-individual-expert-functions)
4. [Byzantine Consensus Validation](#4-byzantine-consensus-validation)
5. [Confidence Score Calibration](#5-confidence-score-calibration)
6. [Fallback Strategy Execution](#6-fallback-strategy-execution)
7. [Helper Functions](#7-helper-functions)
8. [Data Transformation Functions](#8-data-transformation-functions)
9. [Error Handling Patterns](#9-error-handling-patterns)
10. [Testing Patterns](#10-testing-patterns)

---

## 1. Core Semantic Routing Algorithm

### 1.1 Main Routing Entry Point

```pseudocode
ALGORITHM: SemanticRoute(patternRequest, executionContext, routingConstraints)

INPUT:
  patternRequest: PatternRoutingRequest
    - pattern_id: string
    - pattern_query: string
    - pattern_metadata: Record<string, string>
    - preferred_agents?: string[]
    - excluded_agents?: string[]

  executionContext: ExecutionContext
    - user_id: string
    - session_id: string
    - prior_executions: PatternExecution[]
    - prior_routing_decisions: RoutingDecision[]
    - environmental_factors: EnvironmentalFactors
    - user_preferences: UserPreferences

  routingConstraints: RoutingConstraints (optional)
    - max_latency_ms?: number
    - required_security_level?: string
    - require_consensus?: boolean
    - skill_constraints?: string[]

OUTPUT:
  - decision: RoutingDecision
  - latency_ms: number

PERFORMANCE TARGETS:
  - Total latency: <100ms p99
  - Embedding lookup/generation: <20ms
  - HNSW search: <10ms
  - Scoring: <15ms
  - Consensus (if required): <30ms

BEGIN

  // ─────────────────────────────────────────────────────────────────
  // PHASE 1: INITIALIZATION & VALIDATION
  // ─────────────────────────────────────────────────────────────────

  startTime = CURRENT_TIME_MS()
  decisionId = GENERATE_UUID()
  requestId = patternRequest.request_id
  userId = patternRequest.user_id

  // Validate request
  TRY
    VALIDATE_PATTERN_REQUEST(patternRequest)
    VALIDATE_EXECUTION_CONTEXT(executionContext)
  CATCH ValidationError AS e
    LOG_ERROR("Request validation failed", {error: e, requestId: requestId})
    THROW HttpError(400, "Invalid routing request", {details: e.message})
  END TRY

  // Log request
  LOG_DEBUG("Routing request received", {
    requestId: requestId,
    patternId: patternRequest.pattern_id,
    patternQuery: patternRequest.pattern_query,
    userId: userId
  })

  // ─────────────────────────────────────────────────────────────────
  // PHASE 2: CACHE LOOKUP (Check if decision already cached)
  // ─────────────────────────────────────────────────────────────────

  cacheKey = COMPUTE_CACHE_KEY(patternRequest, executionContext)
  cachedDecision = CACHE_GET(cacheKey)

  IF cachedDecision != NULL THEN
    latency = CURRENT_TIME_MS() - startTime
    LOG_DEBUG("Cache hit for routing decision", {
      requestId: requestId,
      latency: latency,
      cacheKey: cacheKey
    })
    RETURN (cachedDecision, latency)
  END IF

  // ─────────────────────────────────────────────────────────────────
  // PHASE 3: PATTERN EMBEDDING
  // ─────────────────────────────────────────────────────────────────

  TRY
    IF patternRequest.pattern_embedding != NULL THEN
      // Use provided embedding
      patternEmbedding = patternRequest.pattern_embedding
      embeddingSource = "provided"
      embeddingLatency = 0
    ELSE
      // Generate embedding via Gemini API
      embeddingStartTime = CURRENT_TIME_MS()
      patternEmbedding = EMBED_PATTERN(
        query=patternRequest.pattern_query,
        metadata=patternRequest.pattern_metadata
      )
      embeddingLatency = CURRENT_TIME_MS() - embeddingStartTime
      embeddingSource = "generated"
    END IF

    // Verify embedding dimensions
    ASSERT LENGTH(patternEmbedding) == 1536, "Invalid embedding dimension"

  CATCH EmbeddingError AS e
    LOG_WARN("Embedding failed, falling back to metadata routing", {
      requestId: requestId,
      error: e.message
    })
    // Fallback: use metadata-only routing
    embeddingLatency = CURRENT_TIME_MS() - startTime
    RETURN ROUTE_BY_METADATA(patternRequest, executionContext, embeddingLatency)

  END TRY

  // ─────────────────────────────────────────────────────────────────
  // PHASE 4: HNSW SIMILARITY SEARCH
  // ─────────────────────────────────────────────────────────────────

  hnsStart = CURRENT_TIME_MS()

  TRY
    candidates = HNSW_SEARCH(
      queryVector=patternEmbedding,
      topK=10,
      efSearch=40
    )
    hnsLatency = CURRENT_TIME_MS() - hnsStart

    // Verify we have candidates
    IF SIZE(candidates) == 0 THEN
      LOG_WARN("HNSW search returned no candidates", {requestId: requestId})
      candidates = METADATA_FALLBACK_SEARCH(patternRequest, 10)
    END IF

  CATCH HnsError AS e
    LOG_ERROR("HNSW search failed", {requestId: requestId, error: e.message})
    candidates = METADATA_FALLBACK_SEARCH(patternRequest, 10)
    hnsLatency = CURRENT_TIME_MS() - hnsStart
  END TRY

  IF SIZE(candidates) == 0 THEN
    LOG_ERROR("No candidates found from HNSW or metadata fallback", {
      requestId: requestId
    })
    THROW NoAgentsAvailableError("Cannot route pattern - no candidates found")
  END IF

  LOG_DEBUG("HNSW search complete", {
    requestId: requestId,
    candidateCount: SIZE(candidates),
    latency: hnsLatency
  })

  // ─────────────────────────────────────────────────────────────────
  // PHASE 5: LOAD AGENT PROFILES
  // ─────────────────────────────────────────────────────────────────

  profileStart = CURRENT_TIME_MS()
  candidateAgentIds = EXTRACT_AGENT_IDS(candidates)

  TRY
    agentProfiles = BATCH_GET_PROFILES(
      agentIds=candidateAgentIds,
      includeHistory=true
    )
    profileLatency = CURRENT_TIME_MS() - profileStart

  CATCH DatabaseError AS e
    LOG_ERROR("Failed to load agent profiles", {requestId: requestId, error: e})
    THROW RoutingServiceError("Cannot load agent profiles")
  END TRY

  IF SIZE(agentProfiles) == 0 THEN
    THROW NoAgentsAvailableError("No agent profiles found")
  END IF

  // ─────────────────────────────────────────────────────────────────
  // PHASE 6: APPLY ROUTING CONSTRAINTS & FILTER
  // ─────────────────────────────────────────────────────────────────

  filterStart = CURRENT_TIME_MS()

  eligibleAgents = FILTER_AGENTS(
    agents=agentProfiles,
    constraints=routingConstraints,
    excluded=patternRequest.excluded_agents,
    preferred=patternRequest.preferred_agents
  )
  filterLatency = CURRENT_TIME_MS() - filterStart

  IF SIZE(eligibleAgents) == 0 THEN
    LOG_WARN("All agents filtered by constraints", {
      requestId: requestId,
      constraints: routingConstraints
    })
    // Apply fallback immediately
    RETURN APPLY_FALLBACK_STRATEGY(
      pattern=patternRequest,
      context=executionContext,
      failureReason="No agents match constraints",
      latencySoFar=CURRENT_TIME_MS() - startTime
    )
  END IF

  LOG_DEBUG("Agent filtering complete", {
    requestId: requestId,
    eligibleCount: SIZE(eligibleAgents),
    latency: filterLatency
  })

  // ─────────────────────────────────────────────────────────────────
  // PHASE 7: MULTI-CRITERIA SCORING (8 EXPERTS)
  // ─────────────────────────────────────────────────────────────────

  scoringStart = CURRENT_TIME_MS()
  agentScores = {}  // agent_id -> score

  FOR EACH agent IN eligibleAgents DO
    TRY
      agentScores[agent.agent_id] = COMPUTE_EXPERT_SCORE(
        agent=agent,
        pattern=patternRequest,
        context=executionContext,
        candidates=candidates,
        allCandidateSimilarities=EXTRACT_SIMILARITY_SCORES(candidates)
      )
    CATCH ScoringError AS e
      LOG_WARN("Scoring failed for agent, using neutral score", {
        agentId: agent.agent_id,
        error: e.message
      })
      agentScores[agent.agent_id] = 0.5  // Neutral score
    END TRY
  END FOR

  scoringLatency = CURRENT_TIME_MS() - scoringStart

  LOG_DEBUG("Scoring complete", {
    requestId: requestId,
    scoredAgents: SIZE(agentScores),
    latency: scoringLatency,
    scores: SAMPLE_SCORES(agentScores, 3)  // Log top 3 for debugging
  })

  // ─────────────────────────────────────────────────────────────────
  // PHASE 8: RANK AGENTS & SELECT TOP 3
  // ─────────────────────────────────────────────────────────────────

  rankedAgents = SORT_BY_SCORE(
    agents=eligibleAgents,
    scores=agentScores,
    descending=true
  )

  IF SIZE(rankedAgents) == 0 THEN
    THROW RoutingError("No agents could be ranked")
  END IF

  primaryAgent = rankedAgents[0]
  primaryScore = agentScores[primaryAgent.agent_id]
  alternativeAgents = TAKE(rankedAgents, 1, 3)  // ranked[1:3]

  LOG_DEBUG("Agent ranking complete", {
    requestId: requestId,
    primaryAgent: primaryAgent.agent_id,
    primaryScore: primaryScore,
    alternativeCount: SIZE(alternativeAgents)
  })

  // ─────────────────────────────────────────────────────────────────
  // PHASE 9: BYZANTINE CONSENSUS (IF REQUIRED)
  // ─────────────────────────────────────────────────────────────────

  consensusRequired = routingConstraints.require_consensus || IS_CRITICAL_PATTERN(patternRequest)
  consensusLatency = 0
  consensusValidatorsAgreed = 0
  consensusResult = "NONE"

  IF consensusRequired THEN
    consensusStart = CURRENT_TIME_MS()

    TRY
      consensusResult = VALIDATE_BYZANTINE(
        primaryAgent=primaryAgent,
        alternatives=alternativeAgents,
        validators=5,
        requiredAgreement=3,
        pattern=patternRequest,
        context=executionContext
      )
      consensusLatency = CURRENT_TIME_MS() - consensusStart
      consensusValidatorsAgreed = GET_VALIDATOR_AGREEMENT_COUNT()

    CATCH ConsensusError AS e
      LOG_ERROR("Consensus validation failed", {
        requestId: requestId,
        error: e.message
      })
      consensusResult = "ERROR"
    END TRY

    IF consensusResult == "ESCALATE" OR consensusResult == "ERROR" THEN
      LOG_WARN("Consensus failed, applying fallback", {
        requestId: requestId,
        consensusResult: consensusResult
      })
      RETURN APPLY_FALLBACK_STRATEGY(
        pattern=patternRequest,
        context=executionContext,
        failureReason=CONCAT("Consensus failed: ", consensusResult),
        latencySoFar=CURRENT_TIME_MS() - startTime
      )
    END IF

  END IF

  LOG_DEBUG("Consensus validation complete", {
    requestId: requestId,
    consensusRequired: consensusRequired,
    consensusResult: consensusResult,
    validatorsAgreed: consensusValidatorsAgreed,
    latency: consensusLatency
  })

  // ─────────────────────────────────────────────────────────────────
  // PHASE 10: COMPUTE CONFIDENCE SCORE
  // ─────────────────────────────────────────────────────────────────

  confidenceStart = CURRENT_TIME_MS()

  // Get secondary agent score for confidence gap
  secondaryScore = IF SIZE(alternativeAgents) > 0
    THEN agentScores[alternativeAgents[0].agent_id]
    ELSE 0.0
  END IF

  TRY
    confidenceScore = CALIBRATE_CONFIDENCE(
      primaryScore=primaryScore,
      secondaryScore=secondaryScore,
      consensusValidatorsAgreed=consensusValidatorsAgreed,
      consensusRequired=consensusRequired,
      pattern=patternRequest,
      context=executionContext,
      agentScores=agentScores
    )
    confidenceLatency = CURRENT_TIME_MS() - confidenceStart

  CATCH ConfidenceError AS e
    LOG_WARN("Confidence calculation failed, using neutral", {
      requestId: requestId,
      error: e.message
    })
    confidenceScore = 0.5
    confidenceLatency = CURRENT_TIME_MS() - confidenceStart
  END TRY

  LOG_DEBUG("Confidence calibration complete", {
    requestId: requestId,
    confidenceScore: confidenceScore,
    latency: confidenceLatency
  })

  // ─────────────────────────────────────────────────────────────────
  // PHASE 11: BUILD REASONING STRING
  // ─────────────────────────────────────────────────────────────────

  reasoning = BUILD_REASONING_STRING(
    primaryAgent=primaryAgent,
    primaryScore=primaryScore,
    secondaryScore=secondaryScore,
    confidenceScore=confidenceScore,
    pattern=patternRequest,
    agentScores=agentScores
  )

  // ─────────────────────────────────────────────────────────────────
  // PHASE 12: BUILD SCORING BREAKDOWN (IF REQUESTED)
  // ─────────────────────────────────────────────────────────────────

  scoringBreakdown = NULL
  IF patternRequest.explain_reasoning THEN
    scoringBreakdown = BUILD_SCORING_BREAKDOWN(
      agent=primaryAgent,
      scores=agentScores,
      experts=GET_EXPERT_SCORES(primaryAgent.agent_id)
    )
  END IF

  // ─────────────────────────────────────────────────────────────────
  // PHASE 13: BUILD ROUTING DECISION OBJECT
  // ─────────────────────────────────────────────────────────────────

  decision = RoutingDecision {
    decision_id: decisionId,
    request_id: requestId,
    timestamp: CURRENT_ISO8601_TIMESTAMP(),

    // Primary selection
    primary_agent: {
      agent_id: primaryAgent.agent_id,
      name: primaryAgent.name,
      score: primaryScore
    },

    // Alternatives
    alternatives: BUILD_ALTERNATIVES(
      agents=alternativeAgents,
      scores=agentScores
    ),

    // Confidence
    confidence_score: confidenceScore,
    confidence_rationale: BUILD_CONFIDENCE_RATIONALE(
      gap=primaryScore - secondaryScore,
      entropy=COMPUTE_ENTROPY(EXTRACT_SCORES(agentScores)),
      consensus=consensusResult
    ),
    confidence_calibration_factor: GET_CALIBRATION_FACTOR(),

    // Scoring breakdown
    scoring_breakdown: scoringBreakdown,

    // Consensus details
    consensus: IF consensusRequired THEN {
      required: true,
      validators: 5,
      validators_agreed: consensusValidatorsAgreed,
      consensus_result: consensusResult,
      validation_latency_ms: consensusLatency
    } ELSE NULL END IF,

    // Reasoning
    reasoning: reasoning,

    // Audit
    user_id: userId,
    execution_context_snapshot: SNAPSHOT_CONTEXT(executionContext)
  }

  // ─────────────────────────────────────────────────────────────────
  // PHASE 14: PERSIST & CACHE
  // ─────────────────────────────────────────────────────────────────

  persistStart = CURRENT_TIME_MS()

  TRY
    // Log decision to audit trail
    LOG_ROUTING_DECISION(decision)

    // Cache decision
    CACHE_SET(
      key=cacheKey,
      value=decision,
      ttl=300  // 5 minutes
    )

    persistLatency = CURRENT_TIME_MS() - persistStart

  CATCH PersistError AS e
    LOG_ERROR("Failed to persist routing decision", {
      requestId: requestId,
      error: e.message
    })
    // Don't fail the request, just log the error
  END TRY

  // ─────────────────────────────────────────────────────────────────
  // PHASE 15: COMPUTE TOTAL LATENCY & RETURN
  // ─────────────────────────────────────────────────────────────────

  totalLatency = CURRENT_TIME_MS() - startTime

  LOG_INFO("Routing decision complete", {
    requestId: requestId,
    decisionId: decisionId,
    primaryAgent: decision.primary_agent.agent_id,
    confidenceScore: confidenceScore,
    totalLatency: totalLatency,
    embeddingLatency: embeddingLatency,
    hnsLatency: hnsLatency,
    scoringLatency: scoringLatency,
    consensusLatency: consensusLatency,
    confidenceLatency: confidenceLatency,
    persistLatency: persistLatency
  })

  // Validate latency SLA
  IF totalLatency > 100 THEN
    LOG_WARN("Routing latency exceeded SLA", {
      requestId: requestId,
      totalLatency: totalLatency,
      sla: 100
    })
  END IF

  RETURN (decision, totalLatency)

END ALGORITHM
```

---

### 1.2 Routing by Metadata (Fallback)

```pseudocode
FUNCTION: ROUTE_BY_METADATA(pattern, context, previousLatency)
RETURNS: RoutingDecision

BEGIN
  LOG_DEBUG("Routing by metadata (embedding unavailable)")

  // Extract metadata
  requiredSkills = EXTRACT_SKILLS(pattern.metadata)
  patternType = EXTRACT_PATTERN_TYPE(pattern.metadata)

  // Find agents with matching skills
  candidates = FIND_AGENTS_BY_SKILLS(
    skills=requiredSkills,
    status="active"
  )

  IF SIZE(candidates) == 0 THEN
    RETURN BUILD_ERROR_DECISION("No agents match required skills")
  END IF

  // Score by success rate only
  agentScores = {}
  FOR EACH agent IN candidates DO
    agentScores[agent.agent_id] = GET_SUCCESS_RATE(
      agent_id=agent.agent_id,
      pattern_type=patternType
    )
  END FOR

  // Select top agent
  primaryAgent = SORT_BY_SCORE(candidates, agentScores)[0]

  decision = RoutingDecision {
    decision_id: GENERATE_UUID(),
    primary_agent: primaryAgent.agent_id,
    primary_score: agentScores[primaryAgent.agent_id],
    alternatives: [],
    confidence_score: 0.5,  // Lower confidence due to fallback
    reasoning: "Routing by metadata matching (embedding unavailable)",
    fallback_applied: "metadata_routing"
  }

  RETURN decision

END FUNCTION
```

---

## 2. Multi-Criteria Scoring with 8 Experts

### 2.1 Main Scoring Function

```pseudocode
FUNCTION: COMPUTE_EXPERT_SCORE(agent, pattern, context, candidates, allCandidateSimilarities)
RETURNS: number ∈ [0, 1]

INPUT:
  agent: AgentCapabilityProfile
  pattern: PatternRoutingRequest
  context: ExecutionContext
  candidates: [(agentId, similarity), ...]
  allCandidateSimilarities: [similarity1, similarity2, ...]

OUTPUT:
  finalScore: number ∈ [0, 1]

BEGIN

  // Initialize expert scores dictionary
  expertScores = {
    similarity: 0.0,
    metadata: 0.0,
    success_rate: 0.0,
    recency: 0.0,
    team_diversity: 0.0,
    latency_fit: 0.0,
    context_relevance: 0.0,
    confidence_calibration: 0.0
  }

  // ─────────────────────────────────────────────────────────
  // EXPERT 1: SEMANTIC SIMILARITY (25% weight)
  // ─────────────────────────────────────────────────────────

  TRY
    expertScores.similarity = EXPERT_SIMILARITY(
      agentId=agent.agent_id,
      candidates=candidates,
      allSimilarities=allCandidateSimilarities
    )
  CATCH Exception AS e
    LOG_WARN("Expert similarity calculation failed", {error: e})
    expertScores.similarity = 0.5
  END TRY

  // ─────────────────────────────────────────────────────────
  // EXPERT 2: METADATA MATCHING (15% weight)
  // ─────────────────────────────────────────────────────────

  TRY
    expertScores.metadata = EXPERT_METADATA(
      agent=agent,
      pattern=pattern,
      requiredSkills=pattern.constraints?.skill_constraints
    )
  CATCH Exception AS e
    LOG_WARN("Expert metadata calculation failed", {error: e})
    expertScores.metadata = 0.5
  END TRY

  // ─────────────────────────────────────────────────────────
  // EXPERT 3: SUCCESS RATE (20% weight)
  // ─────────────────────────────────────────────────────────

  TRY
    patternType = EXTRACT_PATTERN_TYPE(pattern.metadata)
    expertScores.success_rate = EXPERT_SUCCESS_RATE(
      agent=agent,
      patternType=patternType
    )
  CATCH Exception AS e
    LOG_WARN("Expert success rate calculation failed", {error: e})
    expertScores.success_rate = 0.5
  END TRY

  // ─────────────────────────────────────────────────────────
  // EXPERT 4: RECENCY BOOST (10% weight)
  // ─────────────────────────────────────────────────────────

  TRY
    expertScores.recency = EXPERT_RECENCY(
      agent=agent,
      patternType=patternType,
      timeWindowMinutes=60
    )
  CATCH Exception AS e
    LOG_WARN("Expert recency calculation failed", {error: e})
    expertScores.recency = 0.5
  END TRY

  // ─────────────────────────────────────────────────────────
  // EXPERT 5: TEAM DIVERSITY & LOAD (10% weight)
  // ─────────────────────────────────────────────────────────

  TRY
    expertScores.team_diversity = EXPERT_TEAM_DIVERSITY(
      agent=agent,
      context=context,
      allEligibleAgents=[]  // Would be passed in real impl
    )
  CATCH Exception AS e
    LOG_WARN("Expert team diversity calculation failed", {error: e})
    expertScores.team_diversity = 0.5
  END TRY

  // ─────────────────────────────────────────────────────────
  // EXPERT 6: LATENCY FIT (10% weight)
  // ─────────────────────────────────────────────────────────

  TRY
    patternPriority = EXTRACT_PRIORITY(pattern.metadata)
    expertScores.latency_fit = EXPERT_LATENCY_FIT(
      agent=agent,
      patternPriority=patternPriority,
      maxLatency=pattern.constraints?.max_latency_ms
    )
  CATCH Exception AS e
    LOG_WARN("Expert latency fit calculation failed", {error: e})
    expertScores.latency_fit = 0.5
  END TRY

  // ─────────────────────────────────────────────────────────
  // EXPERT 7: CONTEXT RELEVANCE (7% weight)
  // ─────────────────────────────────────────────────────────

  TRY
    expertScores.context_relevance = EXPERT_CONTEXT_RELEVANCE(
      agent=agent,
      context=context,
      pattern=pattern
    )
  CATCH Exception AS e
    LOG_WARN("Expert context relevance calculation failed", {error: e})
    expertScores.context_relevance = 0.5
  END TRY

  // ─────────────────────────────────────────────────────────
  // EXPERT 8: CONFIDENCE CALIBRATION (3% weight)
  // ─────────────────────────────────────────────────────────

  TRY
    expertScores.confidence_calibration = EXPERT_CONFIDENCE_CALIBRATION(
      agent=agent
    )
  CATCH Exception AS e
    LOG_WARN("Expert confidence calibration calculation failed", {error: e})
    expertScores.confidence_calibration = 0.5
  END TRY

  // ─────────────────────────────────────────────────────────
  // NORMALIZE ALL SCORES
  // ─────────────────────────────────────────────────────────

  FOR EACH (key, value) IN expertScores DO
    // Clamp to [0, 1]
    expertScores[key] = CLAMP(value, 0.0, 1.0)

    // Verify is number
    ASSERT IS_NUMBER(expertScores[key]), CONCAT("Score not number: ", key)
  END FOR

  // ─────────────────────────────────────────────────────────
  // COMPUTE WEIGHTED SUM
  // ─────────────────────────────────────────────────────────

  weights = {
    similarity: 0.25,
    metadata: 0.15,
    success_rate: 0.20,
    recency: 0.10,
    team_diversity: 0.10,
    latency_fit: 0.10,
    context_relevance: 0.07,
    confidence_calibration: 0.03
  }

  // Verify weights sum to 1.0
  weightSum = SUM(weights.values())
  ASSERT ABS(weightSum - 1.0) < 0.0001, CONCAT("Weights don't sum to 1.0: ", weightSum)

  // Compute weighted sum
  finalScore = 0.0
  FOR EACH (expertName, weight) IN weights DO
    contribution = expertScores[expertName] * weight
    finalScore = finalScore + contribution

    LOG_TRACE(CONCAT("Expert ", expertName, " contribution: ", contribution), {
      agentId: agent.agent_id,
      score: expertScores[expertName],
      weight: weight
    })
  END FOR

  // Final clamp
  finalScore = CLAMP(finalScore, 0.0, 1.0)

  // ─────────────────────────────────────────────────────────
  // CACHE EXPERT SCORES FOR LATER USE
  // ─────────────────────────────────────────────────────────

  cacheKey = CONCAT("expert_scores:", agent.agent_id)
  CACHE_SET(cacheKey, expertScores, TTL=60)

  LOG_TRACE("Expert scoring complete", {
    agentId: agent.agent_id,
    finalScore: finalScore,
    expertScores: expertScores
  })

  RETURN finalScore

END FUNCTION
```

---

## 3. Individual Expert Functions

### 3.1 Expert 1: Semantic Similarity

```pseudocode
FUNCTION: EXPERT_SIMILARITY(agentId, candidates, allSimilarities)
RETURNS: number ∈ [0, 1]

BEGIN
  // Find this agent in candidates
  agentRank = NULL
  maxSimilarity = NULL

  FOR i = 0 TO SIZE(candidates) - 1 DO
    IF candidates[i].agent_id == agentId THEN
      agentRank = i
      similarityScore = candidates[i].similarity
      BREAK
    END IF
  END FOR

  // If agent not in candidates, return 0.0
  IF agentRank == NULL THEN
    RETURN 0.0
  END IF

  // Normalize similarity score
  // Find max similarity for normalization
  maxSimilarity = MAX(allSimilarities)

  // Compute normalized score
  IF maxSimilarity == 0.0 THEN
    normalizedScore = 0.0
  ELSE
    normalizedScore = similarityScore / maxSimilarity
  END IF

  // Apply rank discount (earlier ranks get slight boost)
  rankDiscount = 1.0 - (agentRank * 0.02)  // 2% discount per rank
  finalScore = normalizedScore * rankDiscount

  RETURN CLAMP(finalScore, 0.0, 1.0)

END FUNCTION
```

### 3.2 Expert 2: Metadata Matching

```pseudocode
FUNCTION: EXPERT_METADATA(agent, pattern, requiredSkills)
RETURNS: number ∈ [0, 1]

BEGIN
  score = 0.0
  maxScore = 0.0

  // Extract skills from pattern
  patternSkills = EXTRACT_SKILLS(pattern.metadata)
  patternSpecializations = EXTRACT_SPECIALIZATIONS(pattern.metadata)
  patternCategory = EXTRACT_CATEGORY(pattern.metadata)

  // SKILL MATCHING
  IF SIZE(patternSkills) > 0 THEN
    maxScore = maxScore + 0.5
    matchedSkills = INTERSECTION(patternSkills, agent.skills)
    skillMatchRatio = SIZE(matchedSkills) / SIZE(patternSkills)
    score = score + (skillMatchRatio * 0.5)
  END IF

  // SPECIALIZATION MATCHING
  IF SIZE(patternSpecializations) > 0 THEN
    maxScore = maxScore + 0.3
    matchedSpecs = INTERSECTION(patternSpecializations, agent.specializations)
    specMatchRatio = SIZE(matchedSpecs) / SIZE(patternSpecializations)
    score = score + (specMatchRatio * 0.3)
  END IF

  // REQUIRED SKILLS CONSTRAINT
  IF requiredSkills != NULL AND SIZE(requiredSkills) > 0 THEN
    maxScore = maxScore + 0.2
    hasAllRequired = ALL(s IN requiredSkills EXISTS s IN agent.skills)
    IF hasAllRequired THEN
      score = score + 0.2
    ELSE
      // Partial credit for matching some required skills
      matchCount = COUNT(s IN requiredSkills WHERE s IN agent.skills)
      partialCredit = (matchCount / SIZE(requiredSkills)) * 0.15
      score = score + partialCredit
    END IF
  END IF

  // Normalize
  IF maxScore > 0 THEN
    normalizedScore = score / maxScore
  ELSE
    normalizedScore = 0.5  // Neutral if no metadata to match
  END IF

  RETURN CLAMP(normalizedScore, 0.0, 1.0)

END FUNCTION
```

### 3.3 Expert 3: Success Rate

```pseudocode
FUNCTION: EXPERT_SUCCESS_RATE(agent, patternType)
RETURNS: number ∈ [0, 1]

BEGIN
  // Get success rate for this pattern type
  IF patternType IN agent.success_rate_by_type THEN
    successRate = agent.success_rate_by_type[patternType]
  ELSE
    // Use default for unknown pattern types
    successRate = agent.success_rate_default
  END IF

  // Ensure in valid range
  successRate = CLAMP(successRate, 0.0, 1.0)

  // Log for debugging
  LOG_TRACE("Success rate lookup", {
    agentId: agent.agent_id,
    patternType: patternType,
    successRate: successRate
  })

  RETURN successRate

END FUNCTION
```

### 3.4 Expert 4: Recency Boost

```pseudocode
FUNCTION: EXPERT_RECENCY(agent, patternType, timeWindowMinutes)
RETURNS: number ∈ [0, 1]

BEGIN
  baseScore = GET_SUCCESS_RATE(agent.agent_id, patternType)
  boostAmount = 0.0
  maxBoost = 0.2

  IF SIZE(agent.recent_wins) == 0 THEN
    RETURN baseScore
  END IF

  currentTime = CURRENT_TIMESTAMP()
  timeWindowSeconds = timeWindowMinutes * 60

  // Check recent wins within time window
  recentWinsInWindow = 0
  recentSuccessesInWindow = 0

  FOR EACH win IN agent.recent_wins DO
    IF win.pattern_type == patternType THEN
      timeSinceWin = TIMESTAMP_DIFF_SECONDS(currentTime, win.timestamp)

      IF timeSinceWin <= timeWindowSeconds THEN
        recentWinsInWindow = recentWinsInWindow + 1

        IF win.success == true THEN
          recentSuccessesInWindow = recentSuccessesInWindow + 1
        END IF
      END IF
    END IF
  END FOR

  // Calculate boost
  IF recentWinsInWindow > 0 THEN
    recentSuccessRatio = recentSuccessesInWindow / recentWinsInWindow
    boostAmount = recentSuccessRatio * maxBoost
  END IF

  finalScore = baseScore + boostAmount
  RETURN CLAMP(finalScore, 0.0, 1.0)

END FUNCTION
```

### 3.5 Expert 5: Team Diversity & Load

```pseudocode
FUNCTION: EXPERT_TEAM_DIVERSITY(agent, context, allEligibleAgents)
RETURNS: number ∈ [0, 1]

BEGIN
  baseScore = 1.0
  penalties = 0.0

  // PENALTY: Already assigned to this team in this session
  IF AGENT_ALREADY_ASSIGNED(agent.agent_id, context) THEN
    penalties = penalties + 0.2
  END IF

  // PENALTY: High current load
  loadPercentage = agent.team_assignments / agent.team_capacity
  IF loadPercentage > 0.8 THEN
    overloadPenalty = (loadPercentage - 0.8) * 0.5
    penalties = penalties + overloadPenalty
  END IF

  // BONUS: Low load (good for diversity)
  IF loadPercentage < 0.3 THEN
    loadBonus = (0.3 - loadPercentage) * 0.1
    penalties = penalties - loadBonus  // Negative penalty = bonus
  END IF

  // PENALTY: Assigned to too many similar agents already
  similarAgentsAssigned = COUNT_SIMILAR_AGENTS_ASSIGNED(
    agentId=agent.agent_id,
    context=context,
    similarityThreshold=0.7
  )
  IF similarAgentsAssigned > 2 THEN
    diversityPenalty = (similarAgentsAssigned - 2) * 0.05
    penalties = penalties + diversityPenalty
  END IF

  finalScore = baseScore - penalties
  RETURN CLAMP(finalScore, 0.0, 1.0)

END FUNCTION
```

### 3.6 Expert 6: Latency Fit

```pseudocode
FUNCTION: EXPERT_LATENCY_FIT(agent, patternPriority, maxLatency)
RETURNS: number ∈ [0, 1]

BEGIN
  // Get agent's latency profile
  agentLatencyP99 = agent.latency_profile.p99
  agentLatencyMax = agent.latency_profile.max

  // Define acceptable latency ranges by priority
  priorityLatencies = {
    "low": {acceptable: 1000, target: 500},
    "medium": {acceptable: 500, target: 200},
    "high": {acceptable: 200, target: 100},
    "critical": {acceptable: 100, target: 50}
  }

  latencyTarget = priorityLatencies[patternPriority].target
  latencyAcceptable = priorityLatencies[patternPriority].acceptable

  // Hard constraint: exceed user's max
  IF maxLatency != NULL AND agentLatencyMax > maxLatency THEN
    RETURN 0.0  // Instant fail
  END IF

  // Score based on fit to priority
  IF agentLatencyP99 <= latencyTarget THEN
    score = 1.0  // Perfect fit
  ELSE IF agentLatencyP99 <= latencyAcceptable THEN
    // Acceptable but not ideal
    scoreRange = latencyAcceptable - latencyTarget
    scoreDistance = agentLatencyP99 - latencyTarget
    score = 1.0 - (scoreDistance / scoreRange) * 0.4  // 0.6-1.0 range
  ELSE
    // Unacceptable
    score = 0.1  // Very low but not zero (might be only option)
  END IF

  RETURN CLAMP(score, 0.0, 1.0)

END FUNCTION
```

### 3.7 Expert 7: Context Relevance

```pseudocode
FUNCTION: EXPERT_CONTEXT_RELEVANCE(agent, context, pattern)
RETURNS: number ∈ [0, 1]

BEGIN
  baseScore = 0.5  // Neutral default

  // BOOST: Agent in user's preferred list
  IF agent.agent_id IN context.user_preferences.preferred_agents THEN
    baseScore = baseScore + 0.3
  END IF

  // PENALTY: Agent in user's excluded list
  IF agent.agent_id IN context.user_preferences.excluded_agents THEN
    RETURN 0.0  // Complete exclusion
  END IF

  // BOOST: Historical success with this user
  userSuccessRate = GET_USER_AGENT_SUCCESS_RATE(
    userId=context.user_id,
    agentId=agent.agent_id,
    window_days=30
  )
  IF userSuccessRate != NULL THEN
    userBoost = (userSuccessRate - 0.5) * 0.2
    baseScore = baseScore + userBoost
  END IF

  // MINOR BOOST: Time-of-day alignment
  timeOfDay = context.environmental.time_of_day
  IF AGENT_ACTIVE_AT_TIME_OF_DAY(agent.agent_id, timeOfDay) THEN
    baseScore = baseScore + 0.05
  END IF

  // BOOST: Recently used successfully
  lastExecutionTime = GET_AGENT_LAST_EXECUTION_TIME(agent.agent_id)
  IF lastExecutionTime != NULL THEN
    timeSinceLastExecution = TIMESTAMP_DIFF_HOURS(CURRENT_TIMESTAMP(), lastExecutionTime)
    IF timeSinceLastExecution < 24 THEN
      // Recently active
      baseScore = baseScore + 0.1
    END IF
  END IF

  RETURN CLAMP(baseScore, 0.0, 1.0)

END FUNCTION
```

### 3.8 Expert 8: Confidence Calibration

```pseudocode
FUNCTION: EXPERT_CONFIDENCE_CALIBRATION(agent)
RETURNS: number ∈ [0, 1]

BEGIN
  // Get agent's recent accuracy
  recentAccuracy = GET_AGENT_RECENT_ACCURACY(
    agentId=agent.agent_id,
    window_days=7
  )

  // Handle case where no recent history
  IF recentAccuracy == NULL THEN
    RETURN 0.5  // Neutral for unproven agents
  END IF

  // Convert accuracy to calibration factor
  // Accuracy 95%+ → 1.05 (slight boost)
  // Accuracy 90-95% → 1.0 (neutral)
  // Accuracy <90% → 0.95 (slight penalty)

  IF recentAccuracy >= 0.95 THEN
    calibrationFactor = 0.5 + (recentAccuracy - 0.95) / 0.05
  ELSE IF recentAccuracy >= 0.90 THEN
    calibrationFactor = 0.5
  ELSE
    calibrationFactor = 0.5 - ((0.90 - recentAccuracy) / 0.10) * 0.05
  END IF

  RETURN CLAMP(calibrationFactor, 0.0, 1.0)

END FUNCTION
```

---

## 4. Byzantine Consensus Validation

### 4.1 Main Consensus Function

```pseudocode
FUNCTION: VALIDATE_BYZANTINE(primaryAgent, alternatives, validators, requiredAgreement, pattern, context)
RETURNS: string ("APPROVE" | "ESCALATE" | "TIMEOUT" | "ERROR")

INPUT:
  primaryAgent: AgentCapabilityProfile
  alternatives: AgentCapabilityProfile[]
  validators: int = 5
  requiredAgreement: int = 3
  pattern: PatternRoutingRequest
  context: ExecutionContext

OUTPUT:
  consensusResult: string

TIMEOUT: 50 milliseconds

BEGIN

  consensusStartTime = CURRENT_TIME_MS()
  validatorResults = {}  // validator_id -> boolean

  // Spawn validators concurrently (parallel execution)
  validatorTasks = []

  // VALIDATOR 1: Semantic Similarity
  PUSH validatorTasks, SPAWN_TASK(
    VALIDATE_SEMANTIC_SIMILARITY,
    {primaryAgent: primaryAgent, alternatives: alternatives, pattern: pattern}
  )

  // VALIDATOR 2: Success Rate History
  PUSH validatorTasks, SPAWN_TASK(
    VALIDATE_SUCCESS_RATE,
    {primaryAgent: primaryAgent, pattern: pattern}
  )

  // VALIDATOR 3: Capability Matching
  PUSH validatorTasks, SPAWN_TASK(
    VALIDATE_CAPABILITY_MATCH,
    {primaryAgent: primaryAgent, pattern: pattern}
  )

  // VALIDATOR 4: Contextual Relevance
  PUSH validatorTasks, SPAWN_TASK(
    VALIDATE_CONTEXT_RELEVANCE,
    {primaryAgent: primaryAgent, context: context, pattern: pattern}
  )

  // VALIDATOR 5: Team Diversity
  PUSH validatorTasks, SPAWN_TASK(
    VALIDATE_TEAM_DIVERSITY,
    {primaryAgent: primaryAgent, context: context}
  )

  // Collect results with timeout
  validatorId = 0
  FOR EACH task IN validatorTasks DO
    TRY
      // Wait for task with timeout
      result = WAIT_FOR_TASK(task, timeout=50)
      validatorResults[validatorId] = result
      validatorId = validatorId + 1

    CATCH TimeoutError
      LOG_WARN("Validator timeout, skipping", {validatorId: validatorId})
      validatorResults[validatorId] = NULL  // Abstention
      validatorId = validatorId + 1

    CATCH Exception AS e
      LOG_ERROR("Validator failed", {validatorId: validatorId, error: e})
      validatorResults[validatorId] = NULL  // Abstention
      validatorId = validatorId + 1
    END TRY

    // Check for total timeout
    IF (CURRENT_TIME_MS() - consensusStartTime) > 50 THEN
      LOG_WARN("Total consensus timeout")
      RETURN "TIMEOUT"
    END IF

  END FOR

  // Count agreements
  agreements = COUNT_TRUE(validatorResults)
  abstentions = COUNT_NULL(validatorResults)

  LOG_DEBUG("Consensus voting complete", {
    agreements: agreements,
    abstentions: abstentions,
    validators: SIZE(validatorResults),
    results: validatorResults
  })

  // Determine consensus
  IF agreements >= requiredAgreement THEN
    consensusResult = "APPROVE"
  ELSE IF agreements < requiredAgreement AND abstentions < (validators - requiredAgreement) THEN
    // Explicit disagreement
    consensusResult = "ESCALATE"
  ELSE
    // Too many abstentions or other error
    consensusResult = "TIMEOUT"
  END IF

  // Log consensus decision
  LOG_CONSENSUS_DECISION(
    primaryAgent=primaryAgent.agent_id,
    consensusResult=consensusResult,
    agreements=agreements,
    abstentions=abstentions,
    validatorResults=validatorResults
  )

  RETURN consensusResult

END FUNCTION
```

### 4.2 Individual Validators

```pseudocode
FUNCTION: VALIDATE_SEMANTIC_SIMILARITY(primaryAgent, alternatives, pattern)
RETURNS: boolean

BEGIN
  // Check if primary agent is among top candidates
  // Returns true if primary has reasonable similarity score
  primaryScore = GET_AGENT_SIMILARITY_SCORE(primaryAgent.agent_id)
  secondaryScore = GET_AGENT_SIMILARITY_SCORE(alternatives[0].agent_id)

  // If gap is >0.1, consider it valid
  IF (primaryScore - secondaryScore) > 0.1 THEN
    RETURN true
  ELSE IF primaryScore > 0.5 THEN
    RETURN true  // Absolute threshold
  ELSE
    RETURN false
  END IF

END FUNCTION


FUNCTION: VALIDATE_SUCCESS_RATE(primaryAgent, pattern)
RETURNS: boolean

BEGIN
  patternType = EXTRACT_PATTERN_TYPE(pattern.metadata)
  successRate = GET_SUCCESS_RATE(primaryAgent.agent_id, patternType)

  // Threshold: >70% success rate required
  RETURN successRate > 0.70

END FUNCTION


FUNCTION: VALIDATE_CAPABILITY_MATCH(primaryAgent, pattern)
RETURNS: boolean

BEGIN
  requiredSkills = EXTRACT_SKILLS(pattern.metadata)

  // Check if agent has all required skills
  FOR EACH skill IN requiredSkills DO
    IF skill NOT IN primaryAgent.skills THEN
      RETURN false
    END IF
  END FOR

  RETURN true

END FUNCTION


FUNCTION: VALIDATE_CONTEXT_RELEVANCE(primaryAgent, context, pattern)
RETURNS: boolean

BEGIN
  // Check if agent is acceptable in current context
  IF primaryAgent.agent_id IN context.user_preferences.excluded_agents THEN
    RETURN false
  END IF

  IF primaryAgent.is_available == false THEN
    RETURN false
  END IF

  RETURN true

END FUNCTION


FUNCTION: VALIDATE_TEAM_DIVERSITY(primaryAgent, context)
RETURNS: boolean

BEGIN
  // Check if agent has capacity and isn't already over-assigned
  loadPercentage = primaryAgent.team_assignments / primaryAgent.team_capacity

  IF loadPercentage > 0.8 THEN
    RETURN false  // Overloaded
  END IF

  RETURN true

END FUNCTION
```

---

## 5. Confidence Score Calibration

### 5.1 Main Calibration Function

```pseudocode
FUNCTION: CALIBRATE_CONFIDENCE(primaryScore, secondaryScore, consensusValidatorsAgreed, consensusRequired, pattern, context, agentScores)
RETURNS: number ∈ [0, 1]

INPUT:
  primaryScore: number ∈ [0, 1]
  secondaryScore: number ∈ [0, 1]
  consensusValidatorsAgreed: int
  consensusRequired: boolean
  pattern: PatternRoutingRequest
  context: ExecutionContext
  agentScores: Record<agentId, score>

OUTPUT:
  confidenceScore: number ∈ [0, 1]

BEGIN

  // ────────────────────────────────────────────────────
  // STEP 1: Score Gap (Primary - Secondary)
  // ────────────────────────────────────────────────────

  scoreGap = primaryScore - secondaryScore
  baseConfidence = scoreGap  // [0, 1] range

  LOG_TRACE("Confidence gap calculation", {
    primaryScore: primaryScore,
    secondaryScore: secondaryScore,
    gap: scoreGap,
    baseConfidence: baseConfidence
  })

  // ────────────────────────────────────────────────────
  // STEP 2: Uncertainty from Entropy
  // ────────────────────────────────────────────────────

  allScores = EXTRACT_SORTED_SCORES(agentScores)
  entropy = COMPUTE_ENTROPY(allScores)

  // Normalize entropy by log(n_agents)
  numAgents = SIZE(agentScores)
  normalizedEntropy = IF numAgents > 1
    THEN entropy / LOG(numAgents)
    ELSE 0.0
  END IF

  // Higher entropy = lower confidence
  uncertaintyPenalty = normalizedEntropy / 2.0  // 0 to 0.5 penalty

  LOG_TRACE("Uncertainty penalty calculation", {
    entropy: entropy,
    numAgents: numAgents,
    normalizedEntropy: normalizedEntropy,
    uncertaintyPenalty: uncertaintyPenalty
  })

  // ────────────────────────────────────────────────────
  // STEP 3: Consensus Contribution
  // ────────────────────────────────────────────────────

  consensusBonus = 0.0
  IF consensusRequired THEN
    // Convert validator agreement to bonus
    consensusRatio = consensusValidatorsAgreed / 5.0
    consensusBonus = consensusRatio * 0.2  // Max +0.2 bonus
  END IF

  LOG_TRACE("Consensus bonus calculation", {
    consensusRequired: consensusRequired,
    validatorsAgreed: consensusValidatorsAgreed,
    consensusBonus: consensusBonus
  })

  // ────────────────────────────────────────────────────
  // STEP 4: Historical Accuracy Calibration
  // ────────────────────────────────────────────────────

  agentRecentAccuracy = GET_AGENT_RECENT_ACCURACY(
    agentId=context.current_agent_id,  // Would get from decision
    windowDays=7
  )

  // Default if no history
  IF agentRecentAccuracy == NULL THEN
    agentRecentAccuracy = 0.85
  END IF

  // Calibration factor: center at 0.925
  calibrationFactor = 1.0 + ((agentRecentAccuracy - 0.925) / 7.5)
  calibrationFactor = CLAMP(calibrationFactor, 0.9, 1.1)

  LOG_TRACE("Accuracy calibration calculation", {
    agentRecentAccuracy: agentRecentAccuracy,
    calibrationFactor: calibrationFactor
  })

  // ────────────────────────────────────────────────────
  // STEP 5: Pattern Execution Uncertainty
  // ────────────────────────────────────────────────────

  patternSuccessRate = GET_PATTERN_EXECUTION_SUCCESS_RATE(
    patternId=pattern.pattern_id,
    recentOnly=true
  )

  IF patternSuccessRate == NULL THEN
    patternSuccessRate = 0.85
  END IF

  patternUncertaintyPenalty = 0.0
  IF patternSuccessRate < 0.8 THEN
    // Uncertain patterns reduce confidence
    patternUncertaintyPenalty = (1.0 - patternSuccessRate) * 0.15
  END IF

  LOG_TRACE("Pattern uncertainty penalty calculation", {
    patternSuccessRate: patternSuccessRate,
    patternUncertaintyPenalty: patternUncertaintyPenalty
  })

  // ────────────────────────────────────────────────────
  // STEP 6: Combine All Factors
  // ────────────────────────────────────────────────────

  // Weighted combination:
  // Base confidence (from score gap): 60%
  // Inverse of uncertainty penalty: 20%
  // Consensus bonus: 10%
  // Pattern uncertainty penalty: 10%

  finalConfidence = (
    (baseConfidence * 0.6) +
    ((1.0 - uncertaintyPenalty) * 0.2) +
    (consensusBonus) +
    (-patternUncertaintyPenalty)
  )

  // Apply calibration factor
  finalConfidence = finalConfidence * calibrationFactor

  // Clamp to [0, 1]
  finalConfidence = CLAMP(finalConfidence, 0.0, 1.0)

  LOG_DEBUG("Final confidence calculation", {
    baseConfidence: baseConfidence,
    uncertaintyPenalty: uncertaintyPenalty,
    consensusBonus: consensusBonus,
    calibrationFactor: calibrationFactor,
    patternUncertaintyPenalty: patternUncertaintyPenalty,
    finalConfidence: finalConfidence
  })

  // ────────────────────────────────────────────────────
  // STEP 7: Determine Confidence Rationale
  // ────────────────────────────────────────────────────

  rationale = ""
  IF finalConfidence > 0.90 THEN
    rationale = "High confidence: Clear winner with strong agreement across criteria"
  ELSE IF finalConfidence > 0.70 THEN
    rationale = "Moderate-high confidence: Reasonable gap between candidates"
  ELSE IF finalConfidence > 0.50 THEN
    rationale = "Moderate confidence: Candidates are relatively close in scores"
  ELSE IF finalConfidence > 0.30 THEN
    rationale = "Low-moderate confidence: Significant uncertainty in selection"
  ELSE
    rationale = "Low confidence: Unclear choice, consider alternatives"
  END IF

  LOG_INFO("Confidence assessment", {
    confidenceScore: finalConfidence,
    rationale: rationale
  })

  RETURN finalConfidence

END FUNCTION
```

---

## 6. Fallback Strategy Execution

### 6.1 Fallback Strategy Manager

```pseudocode
FUNCTION: APPLY_FALLBACK_STRATEGY(pattern, context, failureReason, latencySoFar)
RETURNS: RoutingDecision

INPUT:
  pattern: PatternRoutingRequest
  context: ExecutionContext
  failureReason: string (reason primary routing failed)
  latencySoFar: number (ms already spent)

OUTPUT:
  decision: RoutingDecision

FALLBACK CHAIN:
  1. alternatives (use top-3 alternatives from primary)
  2. skill_match (find agents with matching skills)
  3. success_history (use agent with best history)
  4. round_robin (rotate through available agents)
  5. default_agent (use designated fallback)
  6. error (return error)

BEGIN

  LOG_WARN("Entering fallback strategy", {
    failureReason: failureReason,
    latencySoFar: latencySoFar,
    patternId: pattern.pattern_id
  })

  // Define fallback strategies in order
  fallbackChain = [
    {strategy: "alternatives", priority: 1},
    {strategy: "skill_match", priority: 2},
    {strategy: "success_history", priority: 3},
    {strategy: "round_robin", priority: 4},
    {strategy: "default_agent", priority: 5},
    {strategy: "error", priority: 6}
  ]

  // Try each fallback strategy
  FOR EACH fallbackItem IN fallbackChain DO
    strategy = fallbackItem.strategy

    LOG_DEBUG(CONCAT("Attempting fallback strategy: ", strategy), {
      patternId: pattern.pattern_id
    })

    // ─────────────────────────────────────────────
    // STRATEGY 1: Use Top-3 Alternatives
    // ─────────────────────────────────────────────
    IF strategy == "alternatives" THEN
      TRY
        alternatives = GET_CACHED_ALTERNATIVES(pattern)
        IF alternatives != NULL AND SIZE(alternatives) > 0 THEN
          for each alternativeAgent IN alternatives DO
            IF IS_AVAILABLE(alternativeAgent) THEN
              RETURN BUILD_FALLBACK_DECISION(
                agent=alternativeAgent,
                strategy="alternatives",
                confidenceScore=0.7,
                fallbackReason="Primary unavailable, using alternative"
              )
            END IF
          END FOR
        END IF
      CATCH Exception AS e
        LOG_DEBUG("Alternatives strategy failed, continuing", {error: e})
      END TRY

    // ─────────────────────────────────────────────
    // STRATEGY 2: Find by Skill Match
    // ─────────────────────────────────────────────
    ELSE IF strategy == "skill_match" THEN
      TRY
        requiredSkills = EXTRACT_SKILLS(pattern.metadata)
        IF SIZE(requiredSkills) > 0 THEN
          candidateAgents = FIND_AGENTS_BY_SKILLS(
            skills=requiredSkills,
            availableOnly=true
          )
          IF SIZE(candidateAgents) > 0 THEN
            // Pick highest success rate among candidates
            selectedAgent = SORT_BY_SUCCESS_RATE(candidateAgents)[0]
            RETURN BUILD_FALLBACK_DECISION(
              agent=selectedAgent,
              strategy="skill_match",
              confidenceScore=0.6,
              fallbackReason="Matched agent by required skills"
            )
          END IF
        END IF
      CATCH Exception AS e
        LOG_DEBUG("Skill match strategy failed, continuing", {error: e})
      END TRY

    // ─────────────────────────────────────────────
    // STRATEGY 3: Best by Success History
    // ─────────────────────────────────────────────
    ELSE IF strategy == "success_history" THEN
      TRY
        patternType = EXTRACT_PATTERN_TYPE(pattern.metadata)
        bestAgent = GET_BEST_AGENT_FOR_PATTERN_TYPE(
          patternType=patternType,
          availableOnly=true
        )
        IF bestAgent != NULL THEN
          RETURN BUILD_FALLBACK_DECISION(
            agent=bestAgent,
            strategy="success_history",
            confidenceScore=0.55,
            fallbackReason="Selected by best historical success rate"
          )
        END IF
      CATCH Exception AS e
        LOG_DEBUG("Success history strategy failed, continuing", {error: e})
      END TRY

    // ─────────────────────────────────────────────
    // STRATEGY 4: Round-Robin Load Balancing
    // ─────────────────────────────────────────────
    ELSE IF strategy == "round_robin" THEN
      TRY
        availableAgents = GET_AVAILABLE_AGENTS(status="active")
        IF SIZE(availableAgents) > 0 THEN
          selectedAgent = ROUND_ROBIN_SELECT(availableAgents)
          RETURN BUILD_FALLBACK_DECISION(
            agent=selectedAgent,
            strategy="round_robin",
            confidenceScore=0.4,
            fallbackReason="Selected by round-robin load balancing"
          )
        END IF
      CATCH Exception AS e
        LOG_DEBUG("Round-robin strategy failed, continuing", {error: e})
      END TRY

    // ─────────────────────────────────────────────
    // STRATEGY 5: Use Default Agent
    // ─────────────────────────────────────────────
    ELSE IF strategy == "default_agent" THEN
      TRY
        defaultAgent = GET_DEFAULT_FALLBACK_AGENT()
        IF defaultAgent != NULL AND IS_AVAILABLE(defaultAgent) THEN
          RETURN BUILD_FALLBACK_DECISION(
            agent=defaultAgent,
            strategy="default_agent",
            confidenceScore=0.3,
            fallbackReason="Using designated default fallback agent"
          )
        END IF
      CATCH Exception AS e
        LOG_DEBUG("Default agent strategy failed, continuing", {error: e})
      END TRY

    // ─────────────────────────────────────────────
    // STRATEGY 6: Return Error
    // ─────────────────────────────────────────────
    ELSE IF strategy == "error" THEN
      LOG_ERROR("All fallback strategies exhausted", {
        patternId: pattern.pattern_id,
        failureReason: failureReason,
        latencySoFar: latencySoFar
      })
      THROW NoAgentsAvailableError(
        CONCAT(
          "Cannot route pattern after exhausting fallback strategies. ",
          "Reason: ", failureReason
        )
      )
    END IF

  END FOR

  // Should never reach here
  THROW RoutingError("Fallback strategy execution completed without result")

END FUNCTION
```

---

## 7. Helper Functions

### 7.1 Utility Functions

```pseudocode
FUNCTION: GENERATE_UUID()
RETURNS: string
BEGIN
  // Generate RFC 4122 UUID
  // Implementation: language-specific UUID library
  RETURN UUID_V4()
END FUNCTION


FUNCTION: CURRENT_TIME_MS()
RETURNS: number (milliseconds since epoch)
BEGIN
  RETURN SYSTEM_CLOCK_MILLISECONDS()
END FUNCTION


FUNCTION: CURRENT_ISO8601_TIMESTAMP()
RETURNS: string (ISO 8601 format)
BEGIN
  RETURN CURRENT_DATETIME().to_iso8601()
END FUNCTION


FUNCTION: CLAMP(value, min, max)
RETURNS: number
BEGIN
  IF value < min THEN RETURN min
  ELSE IF value > max THEN RETURN max
  ELSE RETURN value
  END IF
END FUNCTION


FUNCTION: SORT_BY_SCORE(agents, scores, descending=true)
RETURNS: AgentCapabilityProfile[]
BEGIN
  // Create pairs of (agent, score)
  pairs = []
  FOR EACH agent IN agents DO
    PUSH pairs, {agent: agent, score: scores[agent.agent_id]}
  END FOR

  // Sort by score
  IF descending THEN
    SORT pairs BY score DESC
  ELSE
    SORT pairs BY score ASC
  END IF

  // Extract agents
  RETURN [pair.agent for pair IN pairs]
END FUNCTION


FUNCTION: EXTRACT_AGENT_IDS(candidates)
RETURNS: string[]
BEGIN
  // candidates is [(agentId, similarity), ...]
  RETURN [c.agent_id for c IN candidates]
END FUNCTION


FUNCTION: EXTRACT_SKILLS(metadata)
RETURNS: string[]
BEGIN
  // Extract "skills" field from metadata
  IF "skills" IN metadata THEN
    skillsStr = metadata["skills"]
    // Parse comma-separated or array format
    IF TYPE(skillsStr) == string THEN
      RETURN skillsStr.split(",").map(s => s.trim())
    ELSE IF TYPE(skillsStr) == array THEN
      RETURN skillsStr
    END IF
  END IF
  RETURN []
END FUNCTION


FUNCTION: EXTRACT_PATTERN_TYPE(metadata)
RETURNS: string
BEGIN
  // Extract pattern type from metadata
  IF "type" IN metadata THEN
    RETURN metadata["type"]
  ELSE IF "category" IN metadata THEN
    RETURN metadata["category"]
  ELSE
    RETURN "unknown"
  END IF
END FUNCTION


FUNCTION: EXTRACT_PRIORITY(metadata)
RETURNS: string
BEGIN
  // Extract priority level
  IF "priority" IN metadata THEN
    RETURN metadata["priority"]
  ELSE
    RETURN "medium"
  END IF
END FUNCTION


FUNCTION: BUILD_REASONING_STRING(primaryAgent, primaryScore, secondaryScore, confidenceScore, pattern, agentScores)
RETURNS: string

BEGIN
  lines = []

  // Agent selection
  PUSH lines, CONCAT(
    "Selected ", primaryAgent.name, " (", primaryAgent.agent_id, ")",
    " with score ", ROUND(primaryScore, 2)
  )

  // Score gap
  gap = primaryScore - secondaryScore
  IF gap > 0.3 THEN
    PUSH lines, "Clear winner with significant score gap"
  ELSE IF gap > 0.1 THEN
    PUSH lines, "Moderate lead over alternatives"
  ELSE
    PUSH lines, "Narrow margin from runner-up"
  END IF

  // Agent fit
  IF primaryAgent.success_rate_by_type[EXTRACT_PATTERN_TYPE(pattern.metadata)] > 0.9 THEN
    PUSH lines, "Excellent historical success rate on this pattern type"
  END IF

  // Skills
  requiredSkills = EXTRACT_SKILLS(pattern.metadata)
  IF SIZE(requiredSkills) > 0 THEN
    matchedSkills = INTERSECTION(requiredSkills, primaryAgent.skills)
    PUSH lines, CONCAT(
      "Possesses ", SIZE(matchedSkills), "/", SIZE(requiredSkills),
      " required skills"
    )
  END IF

  // Confidence
  IF confidenceScore > 0.9 THEN
    PUSH lines, "High confidence in this selection"
  ELSE IF confidenceScore < 0.6 THEN
    PUSH lines, "Low confidence - consider alternatives"
  END IF

  RETURN JOIN(lines, ". ")

END FUNCTION
```

---

## 8. Data Transformation Functions

```pseudocode
FUNCTION: SNAPSHOT_CONTEXT(context)
RETURNS: Record<string, any>

BEGIN
  // Create point-in-time snapshot of context
  RETURN {
    user_id: context.user_id,
    session_id: context.session_id,
    timestamp: CURRENT_ISO8601_TIMESTAMP(),
    environmental_snapshot: {
      time_of_day: context.environmental.time_of_day,
      day_of_week: context.environmental.day_of_week,
      system_load: context.environmental.system_load
    },
    prior_executions_count: SIZE(context.prior_executions),
    prior_routing_decisions_count: SIZE(context.prior_routing_decisions)
  }

END FUNCTION


FUNCTION: BUILD_ALTERNATIVES(agents, scores)
RETURNS: Array<{agent_id, score, rank}>

BEGIN
  alternatives = []
  FOR i = 0 TO MIN(3, SIZE(agents)) - 1 DO
    agent = agents[i]
    PUSH alternatives, {
      agent_id: agent.agent_id,
      score: scores[agent.agent_id],
      rank: i
    }
  END FOR
  RETURN alternatives

END FUNCTION


FUNCTION: BUILD_FALLBACK_DECISION(agent, strategy, confidenceScore, fallbackReason)
RETURNS: RoutingDecision

BEGIN
  RETURN RoutingDecision {
    decision_id: GENERATE_UUID(),
    primary_agent: {
      agent_id: agent.agent_id,
      name: agent.name,
      score: GET_SUCCESS_RATE(agent.agent_id, "unknown")
    },
    alternatives: [],
    confidence_score: confidenceScore,
    reasoning: fallbackReason,
    fallback_applied: strategy,
    timestamp: CURRENT_ISO8601_TIMESTAMP()
  }

END FUNCTION
```

---

## 9. Error Handling Patterns

### 9.1 Standard Error Responses

```pseudocode
FUNCTION: BUILD_ERROR_DECISION(errorMessage)
RETURNS: RoutingDecision (error variant)

BEGIN
  RETURN {
    error: {
      code: "ROUTING_FAILED",
      message: errorMessage,
      request_id: CURRENT_REQUEST_ID(),
      timestamp: CURRENT_ISO8601_TIMESTAMP()
    }
  }

END FUNCTION


CLASS: RoutingError(message, code)
  extends Error
  - message: string
  - code: string
  - timestamp: string
  - request_id: string

CLASS: NoAgentsAvailableError(message)
  extends RoutingError
  - code = "NO_AGENTS_AVAILABLE"

CLASS: ValidationError(message, field)
  extends RoutingError
  - code = "VALIDATION_ERROR"
  - field: string

CLASS: EmbeddingError(message)
  extends RoutingError
  - code = "EMBEDDING_FAILED"

CLASS: ConsensusError(message)
  extends RoutingError
  - code = "CONSENSUS_FAILED"
```

---

## 10. Testing Patterns

### 10.1 Unit Test Patterns

```pseudocode
TEST_SUITE: "Expert Scoring"

TEST: "Expert similarity returns 1.0 for top candidate"
BEGIN
  agent = {agent_id: "agent1"}
  candidates = [
    {agent_id: "agent1", similarity: 0.95},
    {agent_id: "agent2", similarity: 0.85}
  ]
  result = EXPERT_SIMILARITY("agent1", candidates, [0.95, 0.85])
  ASSERT result == 1.0
END TEST

TEST: "Expert similarity returns 0.0 for missing agent"
BEGIN
  agent = {agent_id: "agent3"}
  candidates = [
    {agent_id: "agent1", similarity: 0.95},
    {agent_id: "agent2", similarity: 0.85}
  ]
  result = EXPERT_SIMILARITY("agent3", candidates, [0.95, 0.85])
  ASSERT result == 0.0
END TEST

TEST: "Weighted score sums to provided score"
BEGIN
  weights = {
    similarity: 0.25,
    metadata: 0.15,
    success_rate: 0.20,
    recency: 0.10,
    team_diversity: 0.10,
    latency_fit: 0.10,
    context_relevance: 0.07,
    confidence_calibration: 0.03
  }
  weightSum = SUM(weights.values())
  ASSERT ABS(weightSum - 1.0) < 0.0001
END TEST

TEST: "Confidence score is always in [0, 1]"
BEGIN
  FOR i = 1 TO 100 DO
    confidence = CALIBRATE_CONFIDENCE(
      RANDOM(0, 1),
      RANDOM(0, 1),
      RANDOM(0, 5),
      RANDOM_BOOL(),
      RANDOM_PATTERN(),
      RANDOM_CONTEXT(),
      RANDOM_AGENT_SCORES()
    )
    ASSERT confidence >= 0.0 AND confidence <= 1.0
  END FOR
END TEST
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-08 | Initial implementation-ready pseudocode |

---

**End of Algorithms Document**

This companion document provides all pseudocode needed to implement Phase 2 routing algorithms without ambiguity.
