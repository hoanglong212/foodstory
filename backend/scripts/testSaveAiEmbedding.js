import { embedText } from '../services/aiEmbeddingClient.js'
import { saveAiDocumentWithEmbedding } from '../services/aiEmbeddingRepository.js'

async function main() {
  const content = `
Bun Bo Hue Co Ba is a Vietnamese spicy beef noodle soup restaurant in Go Vap.
It serves rich beef broth, lemongrass flavor, beef slices, pork sausage, and fresh herbs.
This place is suitable for breakfast, lunch, and people who enjoy spicy Vietnamese noodle soup.
  `.trim()

  const embeddingResult = await embedText(content)

  const saved = await saveAiDocumentWithEmbedding({
    sourceType: 'restaurant',
    sourceId: 1,
    title: 'Bun Bo Hue Co Ba',
    content,
    metadata: {
      cuisine: 'Vietnamese',
      district: 'Go Vap',
      tags: ['spicy', 'beef noodle soup', 'breakfast'],
    },
    chunkText: content,
    embedding: embeddingResult.embedding,
    embeddingModel: embeddingResult.model,
  })

  console.log('Saved AI document:', saved)
  console.log('Embedding dimension:', embeddingResult.dimension)
}

main().catch((error) => {
  console.error('Test failed:', error)
  process.exit(1)
})