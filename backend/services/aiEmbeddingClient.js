const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000'

export async function embedText(text) {
  if (!text || !text.trim()) {
    throw new Error('Text is required for embedding')
  }

  const response = await fetch(`${AI_SERVICE_URL}/embed/text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`AI service error: ${response.status} ${errorText}`)
  }

  const data = await response.json()

  return {
    text: data.text,
    embedding: data.embedding,
    dimension: data.dimension,
    model: data.model,
  }
}
