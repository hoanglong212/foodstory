import assert from 'node:assert/strict'
import test from 'node:test'
import { getAiServiceHeaders } from '../services/aiServiceAuth.js'

test('AI service headers omit authorization when no token is configured', () => {
  const original = process.env.AI_SERVICE_API_TOKEN
  delete process.env.AI_SERVICE_API_TOKEN
  try {
    assert.deepEqual(getAiServiceHeaders({ Accept: 'application/json' }), {
      Accept: 'application/json',
    })
  } finally {
    if (original === undefined) delete process.env.AI_SERVICE_API_TOKEN
    else process.env.AI_SERVICE_API_TOKEN = original
  }
})

test('AI service headers attach the configured bearer token without dropping existing headers', () => {
  const original = process.env.AI_SERVICE_API_TOKEN
  process.env.AI_SERVICE_API_TOKEN = 'test-service-token'
  try {
    assert.deepEqual(getAiServiceHeaders({ 'Content-Type': 'application/json' }), {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-service-token',
    })
  } finally {
    if (original === undefined) delete process.env.AI_SERVICE_API_TOKEN
    else process.env.AI_SERVICE_API_TOKEN = original
  }
})
