import { retrieveRelevantDocumentsWithDebug } from '../services/aiRetrievalService.js'

const testCases = [
  {
    query: 'How to cook a healthy low calorie chicken recipe?',
    expected: 'recipe results',
  },
  {
    query: 'Where can I eat banh mi in District 1?',
    expected: 'restaurant with category and location match when available',
  },
  {
    query: 'Where can I drink cafe in District 1?',
    expected: 'Cafe Trung Nguyen Legend when available',
  },
  {
    query: 'Where can I eat Japanese food in District 1?',
    expected: 'no_exact_constraint_match when no matching restaurant exists',
  },
  {
    query: 'I want a sweet dessert with coffee',
    expected: 'recipe or dessert results',
  },
  {
    query: 'I want Vietnamese spicy beef noodle soup',
    expected: 'relevant recipe or restaurant results',
  },
  {
    query: 'Find restaurants in District 10',
    expected: 'restaurant results in District 10',
  },
  {
    query: 'Can you recommend bun bo and tell me how to make it?',
    expected: 'mixed recipe and restaurant intent',
  },
]

function formatScore(value) {
  return Number.isFinite(value) ? value.toFixed(4) : '-'
}

async function main() {
  const rows = []

  for (const testCase of testCases) {
    const response = await retrieveRelevantDocumentsWithDebug(testCase.query, 5)
    const topResult = response.results[0]

    rows.push({
      query: testCase.query,
      expected: testCase.expected,
      status: response.status,
      detectedIntent: response.detectedIntent,
      topTitle: topResult?.title || '-',
      sourceType: topResult?.sourceType || '-',
      score: formatScore(topResult?.score),
      constraintScore: formatScore(topResult?.constraintScore),
      matchLevel: topResult?.matchLevel || '-',
    })
  }

  console.table(rows)
  process.exit(0)
}

main().catch((error) => {
  console.error('AI retrieval cases failed:', error)
  process.exit(1)
})
