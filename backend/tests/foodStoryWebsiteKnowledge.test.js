import test from 'node:test'
import assert from 'node:assert/strict'
import { routeFoodStoryQuery } from '../services/foodStoryQueryRouter.js'
import {
  answerWebsiteKnowledgeQuestion,
  isWebsiteKnowledgeQuestion,
  retrieveWebsiteKnowledge,
} from '../services/foodStoryWebsiteKnowledgeService.js'

test('answers per-user Food Map ownership from local website knowledge', () => {
  const question = 'Does every user have a different food map?'
  const route = routeFoodStoryQuery(question)
  const response = answerWebsiteKnowledgeQuestion(question, route)

  assert.ok(response)
  assert.equal(response.sources[0].sourceId, 'personal_map')
  assert.equal(response.sources[0].path, '/food-map?mode=personal')
  assert.match(response.answer, /separate My Map/i)
})

test('combines relevant local guidance for a multi-part website question', () => {
  const question = 'How do I add a place and who can edit or delete it?'
  const route = routeFoodStoryQuery(question)
  const response = answerWebsiteKnowledgeQuestion(question, route)

  assert.ok(response)
  assert.equal(response.sources[0].sourceId, 'add_place')
  assert.match(response.answer, /Add New Place/)
  assert.match(response.answer, /edit or delete/i)
  assert.equal(response.sources.every((source) => source.sourceType === 'website'), true)
})

test('does not hijack restaurant data questions as website help', () => {
  const question = 'Where can I eat pho?'
  const route = routeFoodStoryQuery(question)

  assert.equal(isWebsiteKnowledgeQuestion(question, route), false)
  assert.deepEqual(retrieveWebsiteKnowledge(question).results, [])
  assert.equal(answerWebsiteKnowledgeQuestion(question, route), null)
})

test('returns Vietnamese website guidance without a model call', () => {
  const question = 'Lam sao de them dia diem vao Food Map cua toi?'
  const route = routeFoodStoryQuery(question)
  const response = answerWebsiteKnowledgeQuestion(question, route)

  assert.ok(response)
  assert.match(response.answer, /Dang nhap|Đăng nhập/)
  assert.equal(response.sources[0].sourceId, 'add_place')
})
