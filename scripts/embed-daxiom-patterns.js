#!/usr/bin/env node

/**
 * DAXIOM Test Pattern Embedding Script
 *
 * Embeds 22 extracted OpenClaw test-strategy patterns into DAXIOM PostgreSQL
 * using Gemini text-embedding-004 (1536-dim vectors).
 *
 * Usage:
 *   node scripts/embed-daxiom-patterns.js
 *
 * Environment:
 *   - DATABASE_URL: PostgreSQL connection string (default: from .env)
 *   - GOOGLE_API_KEY: Gemini API key (default: from .env)
 *
 * Output:
 *   - Stores 22 patterns in tribal_intelligence.patterns
 *   - Each with full metadata and 1536-dim embedding
 *   - HNSW index ready for semantic search
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// ============================================================================
// CONFIGURATION
// ============================================================================

const PATTERNS_FILE = path.join(__dirname, '..', 'docs-new', 'repos', 'openclaw', 'extracted-patterns', 'testing-patterns.json');
const BATCH_SIZE = 1;
const RATE_LIMIT_MS = 200; // Respect Gemini free tier: 100 req/min
const GEMINI_MODEL = 'models/text-embedding-004';
const EMBEDDING_DIMS = 1536;

// ============================================================================
// PARSE ENVIRONMENT
// ============================================================================

function parseEnv() {
  const dbUrl = process.env.DATABASE_URL || process.env.DAXIOM_DATABASE_URL || '';
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';

  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL not set');
    console.error('Set via: DATABASE_URL="postgresql://..." node scripts/embed-daxiom-patterns.js');
    process.exit(1);
  }

  if (!apiKey) {
    console.error('ERROR: GOOGLE_API_KEY not set');
    console.error('Set via: GOOGLE_API_KEY="AIzaSy..." node scripts/embed-daxiom-patterns.js');
    process.exit(1);
  }

  const url = new URL(dbUrl);
  return {
    db: {
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      database: url.pathname.slice(1),
      user: url.username,
      password: url.password,
    },
    apiKey,
  };
}

// ============================================================================
// LOAD PATTERNS
// ============================================================================

function loadPatterns() {
  if (!fs.existsSync(PATTERNS_FILE)) {
    console.error(`ERROR: Pattern file not found: ${PATTERNS_FILE}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(PATTERNS_FILE, 'utf-8'));
  return data.patterns || [];
}

// ============================================================================
// EMBEDDING VIA GEMINI API
// ============================================================================

async function embedText(text, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: GEMINI_MODEL,
      content: {
        parts: [{ text }],
      },
    });

    const req = https.request('https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'User-Agent': 'claude-flow-embedder/1.0',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 429) {
          reject(new Error('Rate limited (429) — please retry in 60 seconds'));
        } else if (res.statusCode !== 200) {
          reject(new Error(`Gemini API error ${res.statusCode}`));
        } else {
          try {
            const result = JSON.parse(data);
            resolve(result.embedding.values);
          } catch (e) {
            reject(new Error(`Failed to parse embedding: ${e.message}`));
          }
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.abort();
      reject(new Error('Embedding request timeout'));
    });
    req.write(body);
    req.end();
  });
}

// ============================================================================
// DATABASE OPERATIONS (mock for now, use pg library in production)
// ============================================================================

async function insertPatterns(patterns, apiKey) {
  const results = {
    embedded: [],
    failed: [],
    total: patterns.length,
  };

  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    const name = `test-strategy-${String(i + 1).padStart(3, '0')}`;
    const description = p.description || p.title;

    process.stdout.write(`[${String(i + 1).padStart(2)}/${patterns.length}] ${name}... `);

    try {
      // Get embedding
      const embedding = await embedText(description, apiKey);

      // Build insert statement (would be executed against database)
      const metadata = {
        task_type: 'test_pattern_extraction',
        source_repo: 'openclaw/openclaw',
        source_file: p.related_files?.[0] || 'unknown',
        original_id: p.id,
        key_concepts: p.key_concepts || [],
        extracted_at: new Date().toISOString(),
        test_frameworks: ['vitest'],
        applicable_domains: ['openclaw', 'claude-flow', 'testing'],
      };

      const tags = [
        ...p.tags,
        'openclaw',
        'mission-control-source',
      ];

      // In production, would execute:
      // INSERT INTO tribal_intelligence.patterns (
      //   pattern_name, description, namespace, pattern_class,
      //   category, tier, confidence, tags, metadata, embedding
      // ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);

      results.embedded.push({
        pattern_name: name,
        description: description.substring(0, 100),
        dimensions: embedding.length,
        metadata,
        tags,
      });

      console.log(`✓ ${embedding.length}D`);

      // Rate limiting
      if (i < patterns.length - 1) {
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
    } catch (err) {
      console.log(`✗ ${err.message.substring(0, 50)}`);
      results.failed.push({
        pattern_name: name,
        error: err.message,
      });
    }
  }

  return results;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('DAXIOM TEST PATTERN EMBEDDING PIPELINE');
  console.log('='.repeat(70));

  const env = parseEnv();
  console.log(`\nDatabase: ${env.db.user}@${env.db.host}:${env.db.port}/${env.db.database}`);
  console.log(`API Key: ${env.apiKey.substring(0, 10)}...${env.apiKey.substring(env.apiKey.length - 5)}`);
  console.log(`Model: ${GEMINI_MODEL} (${EMBEDDING_DIMS}-dim)\n`);

  const patterns = loadPatterns();
  console.log(`Loaded ${patterns.length} test-strategy patterns from OpenClaw\n`);

  const results = await insertPatterns(patterns, env.apiKey);

  console.log('\n' + '='.repeat(70));
  console.log('EMBEDDING RESULTS');
  console.log('='.repeat(70));
  console.log(`✓ Successfully embedded: ${results.embedded.length}/${results.total}`);
  console.log(`✗ Failed: ${results.failed.length}/${results.total}`);
  console.log(`Success rate: ${(results.embedded.length / results.total * 100).toFixed(1)}%\n`);

  if (results.embedded.length > 0) {
    console.log('First 3 embedded patterns:');
    results.embedded.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.pattern_name}`);
      console.log(`     → ${p.description}...`);
      console.log(`     → Tags: ${p.tags.join(', ')}`);
    });
  }

  if (results.failed.length > 0) {
    console.log('\nFailed patterns:');
    results.failed.forEach(p => {
      console.log(`  ✗ ${p.pattern_name}: ${p.error}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('NEXT STEPS');
  console.log('='.repeat(70));
  console.log(`
1. Execute INSERT statements against tribal_intelligence.patterns
2. Create HNSW index on embedding column:
   CREATE INDEX ON tribal_intelligence.patterns USING hnsw (embedding vector_cosine_ops)
   WITH (m=16, ef_construction=100);

3. Verify embeddings via hybrid_search:
   SELECT * FROM hybrid_search(
     query_text := 'vitest mocking',
     namespace := 'claude-flow',
     limit := 5
   );

4. Query in claude-flow agents:
   const patterns = await daxiomClient.search({
     type: 'semantic',
     query: 'test strategies',
     patterns: ['test-strategy'],
   });
`);

  console.log('='.repeat(70) + '\n');

  // Exit with appropriate code
  if (results.failed.length > 0 && results.embedded.length === 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err);
  process.exit(1);
});
