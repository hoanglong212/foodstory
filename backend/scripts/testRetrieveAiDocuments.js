import { retrieveRelevantDocuments } from '../services/aiRetrievalService.js'

async function main() {
  const query = 'I want a sweet chocolate dessert with coffee'

  const results = await retrieveRelevantDocuments(query, 5)

  console.log('Query:', query)
  console.log('Top results:')

  results.forEach((item, index) => {
    console.log(`\n#${index + 1}`)
    console.log('Title:', item.title)
    console.log('Source:', item.sourceType, item.sourceId)
    console.log('Score:', item.score.toFixed(4))
    console.log('Chunk:', item.chunkText.slice(0, 160) + '...')
  })
}

main().catch((error) => {
  console.error('Retrieval test failed:', error)
  process.exit(1)
})