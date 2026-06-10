import OpenAI from 'openai'
import 'dotenv/config'

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
})

export async function generateFoodStoryAnswer({ question, contexts }) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Missing GROQ_API_KEY in .env')
  }

  const contextText = contexts
    .map((item, index) => {
      return `
Context ${index + 1}
Title: ${item.title}
Source Type: ${item.sourceType}
Score: ${item.score}
Content:
${item.chunkText}
      `.trim()
    })
    .join('\n\n---\n\n')

  const response = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0.2,
    max_tokens: 500,
    messages: [
      {
        role: 'system',
        content: `
You are FoodStory Assistant, a domain-specific assistant for a food discovery web app.

Rules:
- Answer in English.
- Use only the provided FoodStory context.
- Do not invent restaurant names, prices, addresses, ingredients, opening hours, or app features.
- If the context is not enough, say you do not have enough information from FoodStory data.
- Be helpful, clear, and concise.
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