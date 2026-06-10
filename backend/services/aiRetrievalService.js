import { embedText } from './aiEmbeddingClient.js'
import { getAllAiEmbeddings } from './aiEmbeddingRepository.js'

function cosineSimilarity(vectorA, vectorB) {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
    throw new Error('Both inputs must be arrays')
  }

  if (vectorA.length !== vectorB.length) {
    throw new Error(`Vector length mismatch: ${vectorA.length} vs ${vectorB.length}`)
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i]
    normA += vectorA[i] * vectorA[i]
    normB += vectorB[i] * vectorB[i]
  }

  if (normA === 0 || normB === 0) return 0

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export async function retrieveRelevantDocuments(query, topK = 5) {
  if (!query || !query.trim()) {
    throw new Error('Query is required')
  }

  const queryEmbeddingResult = await embedText(query)
  const queryEmbedding = queryEmbeddingResult.embedding

  const storedEmbeddings = await getAllAiEmbeddings()

  const scoredResults = storedEmbeddings.map((item) => {
    const score = cosineSimilarity(queryEmbedding, item.embedding)

    return {
      documentId: item.documentId,
      embeddingId: item.id,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      title: item.title,
      chunkText: item.chunkText,
      content: item.content,
      metadata: item.metadata,
      score,
    }
  })

  scoredResults.sort((a, b) => b.score - a.score)

  return scoredResults.slice(0, topK)
}