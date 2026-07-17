import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildContextualCustomerQuestion,
  buildLocalCustomerCareAnswer,
  isExternalFoodQuestion,
  isGeneralCulinaryQuestion,
  isPrivateFoodStoryQuestion,
} from '../services/foodStoryCustomerConversationService.js'
import {
  buildExternalFoodMessages,
  buildExternalSources,
  buildGeneralCustomerMessages,
  buildGeneralKnowledgeMessages,
} from '../services/groqService.js'

test('customer corrections retain the request they are correcting', () => {
  const question = buildContextualCustomerQuestion('No, I meant chicken', [
    { role: 'user', content: 'Find me an easy tofu dinner' },
    { role: 'assistant', content: 'Here is a tofu recipe.' },
  ])

  assert.match(question, /Find me an easy tofu dinner/)
  assert.match(question, /No, I meant chicken/)
})

test('short Vietnamese cooking follow-ups stay with the latest named dish', () => {
  const question = buildContextualCustomerQuestion('cách làm', [
    { role: 'user', content: 'Cần bao nhiêu trứng?' },
    { role: 'assistant', content: 'Công thức cũ dùng 10 quả trứng.' },
    { role: 'user', content: 'tôi muốn nấu bánh canh cua' },
    { role: 'assistant', content: 'Tôi có thể hướng dẫn theo kiến thức nấu ăn chung.' },
  ])

  assert.match(question, /cách làm bánh canh cua/i)
  assert.doesNotMatch(question, /trứng/i)
})

test('short cooking follow-ups remain unchanged without a recent named dish', () => {
  assert.equal(
    buildContextualCustomerQuestion('cách làm', [
      { role: 'user', content: 'Cần bao nhiêu trứng?' },
      { role: 'assistant', content: 'Bạn đang hỏi công thức nào?' },
    ]),
    'cách làm'
  )
})

test('frustration-only feedback gets a local recovery response', () => {
  const response = buildLocalCustomerCareAnswer('This is not helpful', 'en')

  assert.ok(response)
  assert.match(response.answer, /main goal/i)
  assert.ok(response.suggestions.length >= 3)
})

test('general culinary guidance excludes live restaurant facts', () => {
  assert.equal(
    isGeneralCulinaryQuestion('How can I replace butter with oil in a cake?'),
    true
  )
  assert.equal(
    isGeneralCulinaryQuestion('What is the restaurant address and opening hours?'),
    false
  )
  assert.equal(
    isGeneralCulinaryQuestion(
      'Suggest a quick spicy dinner with no dairy for two people'
    ),
    true
  )
})

test('external research is limited to explicit food research questions', () => {
  assert.equal(
    isExternalFoodQuestion('Search the web for the latest food recall today'),
    true
  )
  assert.equal(
    isExternalFoodQuestion('Show my saved Food Map places'),
    false
  )
  assert.equal(
    isExternalFoodQuestion('What is the latest stock market news?'),
    false
  )
})

test('private FoodStory requests are not eligible for a general model fallback', () => {
  assert.equal(isPrivateFoodStoryQuestion('Show my saved Food Map places'), true)
  assert.equal(isPrivateFoodStoryQuestion('What is photosynthesis?'), false)
})

test('external web sources are sanitized, deduplicated, and bounded', () => {
  const sources = buildExternalSources([
    {
      search_results: [
        { title: 'Official guide', url: 'https://example.org/guide', score: 0.9 },
        { title: 'Duplicate', url: 'https://example.org/guide', score: 0.8 },
        { title: 'Unsafe', url: 'javascript:alert(1)', score: 1 },
      ],
    },
  ])

  assert.equal(sources.length, 1)
  assert.equal(sources[0].sourceType, 'external')
  assert.equal(sources[0].url, 'https://example.org/guide')
})

test('external prompt separates web research from FoodStory records', () => {
  const prompt = buildExternalFoodMessages({
    question: 'What is the latest official food safety guidance for cooked rice?',
  }).map((message) => message.content).join('\n')

  assert.match(prompt, /Never describe web information as FoodStory data/i)
  assert.match(prompt, /official medical or government sources/i)
  assert.ok(prompt.length < 1_500)
})

test('general guidance prompt is bounded and forbids invented FoodStory facts', () => {
  const messages = buildGeneralCustomerMessages({
    question: `How can I fix a soup that is too salty? ${'please '.repeat(300)}`,
    conversationHistory: Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `turn-${index} ${'word '.repeat(100)}`,
    })),
  })
  const prompt = messages.map((message) => message.content).join('\n')

  assert.match(prompt, /never invent website features/i)
  assert.match(prompt, /never rename or silently substitute the requested dish/i)
  assert.match(prompt, /7 complete ordered steps/i)
  assert.ok(prompt.length < 1_600, `general prompt was ${prompt.length} characters`)
})

test('general knowledge prompt clearly separates Groq knowledge from FoodStory data', () => {
  const messages = buildGeneralKnowledgeMessages({
    question: `Explain why the sky is blue. ${'please '.repeat(300)}`,
    conversationHistory: Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `turn-${index} ${'word '.repeat(100)}`,
    })),
  })
  const prompt = messages.map((message) => message.content).join('\n')

  assert.match(prompt, /general-knowledge fallback/i)
  assert.match(prompt, /Never present this answer as FoodStory data/i)
  assert.match(prompt, /Do not infer passwords, account details/i)
  assert.match(prompt, /cannot verify the latest state without live sources/i)
  assert.ok(prompt.length < 1_800, `knowledge prompt was ${prompt.length} characters`)
})

test('named-dish guidance keeps the exact dish and avoids invented variants', () => {
  const messages = buildGeneralCustomerMessages({
    question: 'tôi muốn nấu bánh canh cua',
    responseLanguage: 'vi',
  })
  const prompt = messages.map((message) => message.content).join('\n')

  assert.match(prompt, /Requested dish, verbatim: bánh canh cua/i)
  assert.match(prompt, /do not add a regional-origin claim/i)
  assert.match(prompt, /subtype the customer did not request/i)
})
