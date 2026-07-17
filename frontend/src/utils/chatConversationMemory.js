const DEFAULT_RECENT_MESSAGE_COUNT = 8
const DEFAULT_MAX_MEMORY_CHARS = 3_600

function compactText(value, maxChars) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}

function assistantContext(message = {}, maxChars = 60) {
  const sourceTitles = (message.sources || [])
    .map((source) => source?.title)
    .filter(Boolean)
    .slice(0, 2)
    .join(', ')
  const prefix = [message.intent, sourceTitles].filter(Boolean).join('; ')
  const content = compactText(message.content, maxChars)
  return compactText([prefix, content].filter(Boolean).join(': '), maxChars)
}

function toTurns(messages = []) {
  const turns = []
  for (const message of messages) {
    if (message?.role === 'user') {
      turns.push({ user: message, assistant: null })
      continue
    }
    if (message?.role !== 'bot') continue
    const latest = turns[turns.length - 1]
    if (latest && !latest.assistant) latest.assistant = message
  }
  return turns
}

export function buildConversationMemory(
  messages = [],
  {
    recentMessageCount = DEFAULT_RECENT_MESSAGE_COUNT,
    maxChars = DEFAULT_MAX_MEMORY_CHARS,
  } = {},
) {
  const eligible = messages.filter(
    (message) => ['user', 'bot'].includes(message?.role) && message?.content,
  )
  const olderMessages = eligible.slice(
    0,
    Math.max(0, eligible.length - recentMessageCount),
  )
  const turns = toTurns(olderMessages)
  if (!turns.length) return ''

  const header = 'Earlier turns, oldest to newest:'
  const available = Math.max(200, maxChars - header.length - 1)
  const perTurnBudget = Math.max(64, Math.min(180, Math.floor(available / turns.length)))
  const userBudget = Math.max(30, Math.floor(perTurnBudget * 0.58))
  const assistantBudget = Math.max(20, perTurnBudget - userBudget - 14)
  const lines = turns.map((turn, index) => {
    const user = compactText(turn.user.content, userBudget)
    const assistant = turn.assistant
      ? assistantContext(turn.assistant, assistantBudget)
      : ''
    return compactText(
      `${index + 1}. U: ${user}${assistant ? ` | A: ${assistant}` : ''}`,
      perTurnBudget,
    )
  })

  return `${header}\n${lines.join('\n')}`.slice(0, maxChars)
}

export const CHAT_MEMORY_LIMITS = Object.freeze({
  recentMessageCount: DEFAULT_RECENT_MESSAGE_COUNT,
  maxChars: DEFAULT_MAX_MEMORY_CHARS,
})
