import OpenAI from 'openai'
import 'dotenv/config'

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
})

function trimText(text, maxChars = 700) {
  if (!text) return ''

  const normalizedText = String(text)
  return normalizedText.length > maxChars
    ? `${normalizedText.slice(0, maxChars)}...`
    : normalizedText
}

export async function generateFoodStoryAnswer({ question, contexts }) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Missing GROQ_API_KEY in .env')
  }

  const contextText = contexts
    .slice(0, 3)
    .map((item, index) => {
      return `
Context ${index + 1}
Title: ${item.title}
Type: ${item.sourceType}
Score: ${Number(item.score || 0).toFixed(2)}
Match: ${item.matchLevel || 'unknown'}
Content:
${trimText(item.chunkText || item.content)}
      `.trim()
    })
    .join('\n\n---\n\n')

  const response = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0.2,
    max_tokens: 200,
    messages: [
      {
        role: 'system',
        content: `
You are FoodStory Assistant.
Answer in English using only the provided FoodStory context.
Do not invent restaurants, prices, addresses, ingredients, opening hours, or app features.
If there is no exact match, say so clearly and mention fallback results only as alternatives.
Keep the answer concise.
        `.trim(),
      },
      {
        role: 'user',
        content: `
FoodStory Context:
${contextText}

User Question:
${question}
        `.trim(),
      },
    ],
  })

  return response.choices[0].message.content
}
