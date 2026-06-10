import { embedText } from '../services/aiEmbeddingClient.js'
import { saveAiDocumentWithEmbedding } from '../services/aiEmbeddingRepository.js'

const samples = [
  {
    sourceType: 'restaurant',
    sourceId: 2,
    title: 'Pho Hoa Pasteur',
    content: `
Pho Hoa Pasteur is a Vietnamese pho restaurant known for beef noodle soup, clear broth, herbs, bean sprouts, and sliced beef.
It is suitable for breakfast and lunch.
    `.trim(),
    metadata: {
      cuisine: 'Vietnamese',
      tags: ['pho', 'beef noodle soup', 'breakfast'],
    },
  },
  {
    sourceType: 'recipe',
    sourceId: 3,
    title: 'Japanese Sushi Roll',
    content: `
Japanese sushi roll is made with rice, seaweed, fresh fish, cucumber, avocado, and soy sauce.
It is a light Japanese dish and is not spicy.
    `.trim(),
    metadata: {
      cuisine: 'Japanese',
      tags: ['sushi', 'rice', 'fish'],
    },
  },
  {
    sourceType: 'recipe',
    sourceId: 4,
    title: 'Chocolate Tiramisu Dessert',
    content: `
Chocolate tiramisu is a sweet dessert made with mascarpone, coffee, cocoa powder, cream, and soft cake layers.
It is suitable after dinner.
    `.trim(),
    metadata: {
      cuisine: 'Italian',
      tags: ['dessert', 'chocolate', 'coffee'],
    },
  },
  {
    sourceType: 'restaurant',
    sourceId: 5,
    title: 'Korean BBQ House',
    content: `
Korean BBQ House serves grilled beef, pork belly, kimchi, spicy sauce, lettuce wraps, and side dishes.
It is suitable for dinner with groups.
    `.trim(),
    metadata: {
      cuisine: 'Korean',
      tags: ['bbq', 'grilled meat', 'kimchi'],
    },
  },
]

async function main() {
  for (const sample of samples) {
    const embeddingResult = await embedText(sample.content)

    const saved = await saveAiDocumentWithEmbedding({
      sourceType: sample.sourceType,
      sourceId: sample.sourceId,
      title: sample.title,
      content: sample.content,
      metadata: sample.metadata,
      chunkText: sample.content,
      embedding: embeddingResult.embedding,
      embeddingModel: embeddingResult.model,
    })

    console.log('Saved:', saved.title)
  }

  console.log('Seed sample AI documents done.')
}

main().catch((error) => {
  console.error('Seed failed:', error)
  process.exit(1)
})