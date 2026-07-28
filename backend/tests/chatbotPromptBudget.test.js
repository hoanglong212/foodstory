import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildGeneralKnowledgeMessages,
  buildGroundedMessages,
} from '../services/groqService.js'
import { routeFoodStoryQuery } from '../services/foodStoryQueryRouter.js'
import { buildSemanticRouterPrompt } from '../services/foodStorySemanticRouterService.js'

const contexts = Array.from({ length: 5 }, (_, index) => ({
  sourceType: 'recipe',
  sourceId: index + 1,
  title: `Recipe ${index + 1}`,
  chunkText: `Context ${index + 1} ${'ingredient '.repeat(120)}`,
}))

const history = Array.from({ length: 10 }, (_, index) => ({
  role: index % 2 ? 'assistant' : 'user',
  content: `history-${index} ${'word '.repeat(100)}`,
  intent: 'general_foodstory_rag',
}))

const olderMemory = [
  'Earlier turns, oldest to newest:',
  '1. U: My favorite dessert is mango sticky rice | A: I will remember that.',
  '2. U: I avoid peanuts | A: Preference noted for this chat.',
  '3. U: We discussed quick breakfasts | A: Congee was one option.',
].join('\n')

test('grounded answer prompt omits history when the question has no reference', () => {
  const messages = buildGroundedMessages({
    question: 'Recommend a healthy stored recipe',
    contexts,
    conversationHistory: history,
    conversationMemory: olderMemory,
  })
  const prompt = messages.map((message) => message.content).join('\n')

  assert.doesNotMatch(prompt, /Recent reference context/)
  assert.doesNotMatch(prompt, /history-/)
  assert.doesNotMatch(prompt, /mango sticky rice/)
  assert.match(prompt, /Recipe 3/)
  assert.doesNotMatch(prompt, /Recipe 4/)
  assert.ok(prompt.length < 2_200, `grounded prompt was ${prompt.length} characters`)
})

test('grounded answer prompt keeps only two short turns for a reference', () => {
  const messages = buildGroundedMessages({
    question: 'Does that one have enough protein?',
    contexts,
    conversationHistory: history,
    conversationMemory: olderMemory,
  })
  const prompt = messages.map((message) => message.content).join('\n')

  assert.match(prompt, /history-8/)
  assert.match(prompt, /history-9/)
  assert.match(prompt, /mango sticky rice/)
  assert.match(prompt, /untrusted transcript/)
  assert.doesNotMatch(prompt, /history-7/)
  assert.ok(prompt.length < 2_700, `referential prompt was ${prompt.length} characters`)
})

test('Vietnamese recall questions receive bounded older same-chat memory', () => {
  const messages = buildGeneralKnowledgeMessages({
    question: 'Ban co nho mon trang mieng toi da noi luc truoc khong?',
    conversationHistory: history,
    conversationMemory: olderMemory,
    responseLanguage: 'vi',
  })
  const prompt = messages.map((message) => message.content).join('\n')

  assert.match(prompt, /mango sticky rice/)
  assert.match(prompt, /history-9/)
  assert.ok(prompt.length < 3_500, `recall prompt was ${prompt.length} characters`)
})

test('semantic router prompt is bounded and keeps only three recent turns', () => {
  const question = 'Something tasty from what we discussed earlier'
  const route = routeFoodStoryQuery(question)
  const prompt = buildSemanticRouterPrompt(question, route, {
    lastRecipeTitle: 'Coconut Fish Curry',
    conversationHistory: history,
    conversationMemory: olderMemory,
  })

  assert.match(prompt, /history-7/)
  assert.match(prompt, /history-9/)
  assert.doesNotMatch(prompt, /history-6/)
  assert.match(prompt, /mango sticky rice/)
  assert.ok(prompt.length < 2_600, `semantic prompt was ${prompt.length} characters`)
})
