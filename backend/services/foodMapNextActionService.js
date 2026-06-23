const MESSAGES = Object.freeze({
  focus_existing_place: 'Đã tìm thấy địa điểm này trên Food Map.',
  review_draft_place:
    'Đã tạo bản nháp địa điểm. Vui lòng kiểm tra trước khi lưu.',
  choose_candidate:
    'Có nhiều địa điểm phù hợp. Vui lòng chọn địa điểm đúng.',
  explore_dish_nearby:
    'Chưa xác định được chính xác quán trong ảnh, nhưng đã nhận diện được món ăn.',
  ask_for_clearer_image:
    'Ảnh hiện tại chưa đủ rõ để đọc thông tin quán. Bạn có thể gửi ảnh rõ hơn.',
  ask_for_hint:
    'Mình cần thêm gợi ý như tên quán, địa chỉ hoặc khu vực để tìm chính xác hơn.',
  none: 'Đã trích xuất bằng chứng, nhưng chưa có hành động tiếp theo phù hợp.',
})

function action(type, payload = {}) {
  return {
    type,
    message: MESSAGES[type],
    payload,
  }
}

function nonEmptyArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function entityValue(entity) {
  if (typeof entity === 'string') return entity.trim()
  return typeof entity?.value === 'string' ? entity.value.trim() : ''
}

function dishNamesFrom(input = {}) {
  const values = [
    ...nonEmptyArray(input?.entities?.dishNames),
    ...nonEmptyArray(input?.dishNames),
  ]
  const result = []
  const seen = new Set()

  for (const item of values) {
    const value = entityValue(item)
    const key = value.toLocaleLowerCase()
    if (!value || seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }

  return result.slice(0, 8)
}

function existingPlaceFrom(input = {}) {
  const integration = input?.integration
  return (
    integration?.matchedPlace ||
    input?.matchedPlace ||
    input?.matchedFoodMapPlace ||
    input?.foodMapMatch ||
    null
  )
}

function draftPlaceFrom(input = {}) {
  const integration = input?.integration
  return (
    integration?.draftPlace ||
    input?.draftPlace ||
    input?.addPlaceDraft ||
    null
  )
}

function candidatesFrom(input = {}) {
  return nonEmptyArray(
    input?.locationResolution?.candidates || input?.candidates,
  )
}

function ocrUsable(evidence) {
  return evidence?.usable === true || evidence?.ocrUsable === true
}

function hasReliableEntityEvidence(entities = {}) {
  return Boolean(
    entityValue(entities.address) ||
      entityValue(entities.placeName) ||
      nonEmptyArray(entities.phones).length ||
      nonEmptyArray(entities.locationHints).length,
  )
}

function locationProviderUnavailable(input = {}) {
  if (input?.locationQuery?.canResolveLocation !== true) return false
  return ['provider_disabled', 'missing_api_key'].includes(
    input?.locationResolution?.status,
  )
}

function sourceWarnings(input = {}) {
  return nonEmptyArray(input?.sourceAnalysis?.warnings).map((warning) =>
    String(warning || '').trim(),
  )
}

function urlEvidenceNeedsHint(input = {}) {
  const sourceAnalysis = input?.sourceAnalysis || {}
  if (
    !String(sourceAnalysis.inputType || '').includes('url') ||
    sourceAnalysis.hintProvided === true ||
    input?.locationQuery?.canResolveLocation === true
  ) {
    return false
  }
  const warnings = new Set(sourceWarnings(input))
  return (
    warnings.has('metadata_blocked_or_empty') ||
    warnings.has('weak_url_metadata')
  )
}

function evidenceValidatorRequestsHint(input = {}) {
  return Boolean(
    (
      input?.evidenceValidation?.applied === true ||
      (
        input?.evidenceValidation?.requested === true &&
        input?.evidenceValidation?.status === 'fallback'
      )
    ) &&
      input.evidenceValidation.canResolveLocation === false &&
      input.evidenceValidation.recommendedNextAction === 'ask_for_hint' &&
      input?.locationQuery?.canResolveLocation !== true,
  )
}

export function buildFoodMapNextAction(input = {}) {
  const safeInput =
    input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const integration = safeInput.integration || {}
  const matchedPlace = existingPlaceFrom(safeInput)

  if (
    matchedPlace &&
    (
      integration.action === 'focus_existing_place' ||
      safeInput.action === 'focus_existing_place' ||
      safeInput.foodMapMatch ||
      safeInput.matchedPlace ||
      safeInput.matchedFoodMapPlace
    )
  ) {
    return action('focus_existing_place', { matchedPlace })
  }

  const draftPlace = draftPlaceFrom(safeInput)
  if (
    draftPlace &&
    (
      integration.action === 'review_draft_place' ||
      safeInput.action === 'review_draft_place' ||
      safeInput.draftPlace ||
      safeInput.addPlaceDraft
    )
  ) {
    return action('review_draft_place', { draftPlace })
  }

  if (safeInput.locationResolution?.status === 'multiple_candidates') {
    return action('choose_candidate', {
      candidates: candidatesFrom(safeInput),
    })
  }

  if (locationProviderUnavailable(safeInput)) {
    return action('none')
  }

  const entities = safeInput.entities || {}
  const uploadedImageOcrFailed =
    safeInput.imageProvided === true &&
    !ocrUsable(safeInput.ocrEvidence) &&
    safeInput.locationQuery?.canResolveLocation !== true &&
    !hasReliableEntityEvidence(entities)

  if (uploadedImageOcrFailed) {
    return action('ask_for_clearer_image')
  }

  if (evidenceValidatorRequestsHint(safeInput)) {
    return action('ask_for_hint')
  }

  if (urlEvidenceNeedsHint(safeInput)) {
    return action('ask_for_hint')
  }

  const dishNames = dishNamesFrom(safeInput)
  if (
    dishNames.length &&
    safeInput.locationQuery?.canResolveLocation !== true
  ) {
    return action('explore_dish_nearby', { dishNames })
  }

  const evidenceIsWeak =
    safeInput.locationQuery?.canResolveLocation !== true ||
    entities.status === 'unclear' ||
    safeInput.locationResolution?.status === 'not_found' ||
    safeInput.locationResolution?.status === 'error'

  if (evidenceIsWeak) {
    return action('ask_for_hint')
  }

  return action('none')
}
