export function getAiServiceHeaders(headers = {}) {
  const token = String(process.env.AI_SERVICE_API_TOKEN || '').trim()
  if (!token) return { ...headers }

  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  }
}
