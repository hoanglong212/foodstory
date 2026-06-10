import { retrieveRelevantDocuments } from './aiRetrievalService.js'
import { generateFoodStoryAnswer } from './groqService.js'

export async function askFoodStoryChatbot(question) {
  if (!question || !question.trim()) {
    throw new Error('Question is required')
  }

  const contexts = await retrieveRelevantDocuments(question, 5)

  const bestScore = contexts[0]?.score || 0

  if (!contexts.length || bestScore < 0.35) {
    return {
      answer: "I don't have enough information from FoodStory data to answer that confidently.",
      mode: 'no_context',
      confidence: Number(bestScore.toFixed(4)),
      sources: [],
    }
  }

  const answer = await generateFoodStoryAnswer({
    question,
    contexts,
  })

  return {
    answer,
    mode: 'rag',
    confidence: Number(bestScore.toFixed(4)),
    sources: contexts.map((item) => ({
      documentId: item.documentId,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      title: item.title,
      score: Number(item.score.toFixed(4)),
    })),
  }
}