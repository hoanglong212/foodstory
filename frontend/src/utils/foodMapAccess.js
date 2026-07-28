const AUTHENTICATED_MODES = new Set(['personal', 'community', 'stats'])

export function resolveInitialFoodMapMode(requestedMode, isLoggedIn) {
  const requested = AUTHENTICATED_MODES.has(requestedMode)
    ? requestedMode
    : isLoggedIn
      ? 'personal'
      : 'community'

  if (!isLoggedIn && requested !== 'community') return 'community'
  return requested
}

export function canUseFoodMapContributions(isLoggedIn) {
  return Boolean(isLoggedIn)
}
