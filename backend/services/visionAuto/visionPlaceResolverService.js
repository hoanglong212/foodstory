import { buildFoodMapLocationQuery } from '../foodMapLocationQueryService.js'
import { resolveFoodMapLocation } from '../foodMapLocationResolutionService.js'

function unresolvedResolution(status, reason, warnings = []) {
  return {
    status,
    resolvedLocation: null,
    candidates: [],
    confidence: 0,
    reason,
    warnings,
  }
}

function warningCodes(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => {
          const text = String(value || '').toLowerCase()
          if (/timeout/.test(text)) return 'places_timeout'
          if (/quota|forbidden|403/.test(text)) {
            return 'places_forbidden_or_quota'
          }
          return 'places_provider_error'
        })
        .filter(Boolean),
    ),
  ].slice(0, 8)
}

export async function resolveVisionPlaceCandidates(
  {
    entities = {},
    validation = {},
    config = {},
  } = {},
  {
    buildLocationQuery = buildFoodMapLocationQuery,
    resolveLocation = resolveFoodMapLocation,
    locationOptions = {},
  } = {},
) {
  const draftQuery = buildLocationQuery({ entities })
  const locationQuery =
    validation.canResolveLocation === false
      ? {
          ...draftQuery,
          query: null,
          canResolveLocation: false,
          reason: 'evidence_validator_rejected_location_resolution',
        }
      : draftQuery

  if (!locationQuery.canResolveLocation) {
    return {
      locationQuery,
      resolution: unresolvedResolution(
        'not_requested',
        locationQuery.reason || 'insufficient_location_evidence',
      ),
      placeCandidates: [],
      warnings: [],
    }
  }

  if (String(config.locationProvider || '').toLowerCase() === 'disabled') {
    const resolution = unresolvedResolution(
      'provider_disabled',
      'location_resolution_provider_disabled',
    )
    return {
      locationQuery,
      resolution,
      placeCandidates: [],
      warnings: [],
    }
  }

  let resolution
  try {
    resolution = await resolveLocation(
      {
        locationQuery,
        entities,
      },
      {
        provider: config.locationProvider,
        timeoutMs: config.googlePlacesTimeoutMs,
        ...locationOptions,
      },
    )
  } catch {
    resolution = unresolvedResolution(
      'error',
      'provider_error',
      ['places_provider_error'],
    )
  }

  return {
    locationQuery,
    resolution,
    placeCandidates: Array.isArray(resolution?.candidates)
      ? resolution.candidates.slice(0, 5)
      : [],
    warnings: warningCodes(resolution?.warnings),
  }
}

