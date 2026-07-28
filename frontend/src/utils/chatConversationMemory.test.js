import { describe, expect, it } from 'vitest'
import { buildConversationMemory } from './chatConversationMemory'

function conversation(turnCount) {
  return Array.from({ length: turnCount }, (_, index) => [
    {
      role: 'user',
      content: `User request ${index + 1} about remembered topic ${index + 1}`,
    },
    {
      role: 'bot',
      content: `Assistant answer ${index + 1}`,
      intent: `intent_${index + 1}`,
      sources: [{ title: `Source ${index + 1}` }],
    },
  ]).flat()
}

describe('chat conversation memory', () => {
  it('keeps all older turns represented within the fixed budget', () => {
    const memory = buildConversationMemory(conversation(35), {
      recentMessageCount: 8,
      maxChars: 3_600,
    })

    expect(memory.length).toBeLessThanOrEqual(3_600)
    expect(memory).toContain('User request 1')
    expect(memory).toContain('User request 16')
    expect(memory).toContain('User request 31')
    expect(memory).not.toContain('User request 35')
  })

  it('returns no older memory for a short conversation', () => {
    expect(buildConversationMemory(conversation(3))).toBe('')
  })
})
