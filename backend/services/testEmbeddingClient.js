import { embedText } from './aiEmbeddingClient.js'

async function main() {
  const result = await embedText('spicy beef noodle soup near Go Vap')

  console.log('Text:', result.text)
  console.log('Model:', result.model)
  console.log('Dimension:', result.dimension)
  console.log('First 5 numbers:', result.embedding.slice(0, 5))
}

main().catch(console.error)