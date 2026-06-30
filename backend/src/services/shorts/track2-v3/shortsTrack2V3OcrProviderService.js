function safeString(value, maxLength = 20000) {
  if (value == null) return ''
  return String(value).replace(/\s+$/u, '').slice(0, maxLength)
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeWhitespace(value) {
  return safeString(value)
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function providerError(code, message, details = {}) {
  return {
    source: 'track2_v3_cheap_ocr',
    stage: 'cheap_ocr',
    code,
    message,
    recoverable: true,
    ...details,
  }
}

function diagnosticToProviderError(diagnostic = {}) {
  const code = safeString(diagnostic.code || diagnostic.reason || 'TRACK2_V3_OCR_PROVIDER_WARNING', 120)
  return providerError(
    code,
    safeString(diagnostic.message || diagnostic.error || code, 500),
    {
      ...(diagnostic.status ? { status: diagnostic.status } : {}),
      ...(Number.isFinite(Number(diagnostic.frameIndex))
        ? { frameIndex: Number(diagnostic.frameIndex) }
        : {}),
    },
  )
}

function normalizeOcrBlock(block = {}, index = 0, sourceVariant = {}) {
  const rawText = normalizeWhitespace(block.rawText || block.text || block.description || '')
  if (!rawText) return null

  return {
    id: safeString(block.id || `ocr:block:${index}`, 120),
    provider: safeString(block.provider || block.source || 'google_vision_text', 80),
    sourceType: safeString(
      block.sourceType || sourceVariant.sourceType || 'ocr_frame_full',
      80,
    ),
    imageVariant: safeString(
      block.imageVariant || block.variant || sourceVariant.variant || 'full_raw',
      80,
    ),
    frameIndex: finiteNumber(block.frameIndex ?? sourceVariant.frameIndex, 0),
    timestampSeconds: finiteNumber(block.timestampSeconds ?? sourceVariant.timestampSeconds, null),
    rawText,
    normalizedText: normalizeWhitespace(block.normalizedText || rawText),
    confidence: finiteNumber(block.confidence, 0),
    bbox: block.bbox || null,
  }
}

function normalizeOcrBlocks(textBlocks = [], variants = []) {
  return (Array.isArray(textBlocks) ? textBlocks : [])
    .map((block, index) => normalizeOcrBlock(block, index, variants[index] || {}))
    .filter(Boolean)
}

function variantsWithImages(frameVariants = {}) {
  return (Array.isArray(frameVariants.variants) ? frameVariants.variants : [])
    .filter((variant) => variant?.imagePath || variant?.imageBuffer || variant?.imageBase64)
}

async function runInjectedProvider(provider, frameVariants, config, deps) {
  const variants = Array.isArray(frameVariants.variants) ? frameVariants.variants : []
  const providerResult = await provider({
    variants,
    images: variantsWithImages(frameVariants),
    metadata: deps.context?.metadata || deps.metadata || null,
    context: deps.context || null,
    config,
  })

  return {
    providerResult,
    sourceVariants: variants,
  }
}

async function runLegacyProvider(provider, frameVariants, deps) {
  const frames = variantsWithImages(frameVariants)
    .filter((variant) => variant.variant === 'full_raw')
    .map((variant) => ({
      frameIndex: variant.frameIndex,
      timestampSeconds: variant.timestampSeconds,
      imagePath: variant.imagePath,
      mimeType: variant.mimeType || 'image/jpeg',
      sizeBytes: variant.sizeBytes || 0,
    }))

  if (!frames.length) {
    return {
      providerResult: {
        status: 'UNAVAILABLE',
        reason: 'TRACK2_V3_NO_OCR_IMAGES',
        textBlocks: [],
        diagnostics: [
          {
            code: 'TRACK2_V3_NO_OCR_IMAGES',
            message: 'Track 2 V3 has no extracted images for cheap OCR.',
          },
        ],
      },
      sourceVariants: [],
    }
  }

  const providerResult = await provider({
    frames,
    metadata: deps.context?.metadata || deps.metadata || null,
  })

  return {
    providerResult,
    sourceVariants: frames.map((frame) => ({
      ...frame,
      variant: 'full_raw',
      sourceType: 'ocr_frame_full',
    })),
  }
}

export async function runShortsTrack2V3CheapOcr(frameVariants = {}, config = {}, deps = {}) {
  const variants = Array.isArray(frameVariants.variants) ? frameVariants.variants : []
  const injectedBlocks = Array.isArray(deps.track2V3OcrBlocks) ? deps.track2V3OcrBlocks : null
  const imageCount = frameVariants.variantCount ?? variants.length

  if (injectedBlocks) {
    const textBlocks = normalizeOcrBlocks(injectedBlocks, variants)
    return {
      status: 'OK',
      reason: textBlocks.length ? 'OCR_TEXT_COLLECTED' : 'OCR_NO_TEXT',
      textBlocks,
      providerErrors: [],
      imageCount,
    }
  }

  const provider = typeof deps.track2V3OcrProvider === 'function'
    ? deps.track2V3OcrProvider
    : null
  const legacyProvider = !provider && typeof deps.track2OcrProvider === 'function'
    ? deps.track2OcrProvider
    : null

  if (!provider && !legacyProvider) {
    return {
      status: 'UNAVAILABLE',
      reason: 'TRACK2_V3_OCR_PROVIDER_UNAVAILABLE',
      textBlocks: [],
      providerErrors: [
        providerError(
          'TRACK2_V3_OCR_PROVIDER_UNAVAILABLE',
          'No cheap OCR provider is configured for Track 2 V3.',
        ),
      ],
      imageCount,
    }
  }

  try {
    const { providerResult, sourceVariants } = provider
      ? await runInjectedProvider(provider, frameVariants, config, deps)
      : await runLegacyProvider(legacyProvider, frameVariants, deps)

    const status = safeString(providerResult?.status || 'OK', 80).toUpperCase()
    const textBlocks = normalizeOcrBlocks(providerResult?.textBlocks, sourceVariants)
    const diagnostics = Array.isArray(providerResult?.diagnostics)
      ? providerResult.diagnostics
      : []
    const providerErrors = diagnostics.map(diagnosticToProviderError)

    if (status === 'UNAVAILABLE' || status === 'ERROR') {
      return {
        status,
        reason: providerResult?.reason || (
          status === 'UNAVAILABLE'
            ? 'TRACK2_V3_OCR_PROVIDER_UNAVAILABLE'
            : 'TRACK2_V3_OCR_PROVIDER_ERROR'
        ),
        textBlocks: [],
        providerErrors,
        imageCount,
      }
    }

    return {
      status: 'OK',
      reason: textBlocks.length ? 'OCR_TEXT_COLLECTED' : 'OCR_NO_TEXT',
      textBlocks,
      providerErrors,
      imageCount,
    }
  } catch (error) {
    return {
      status: 'ERROR',
      reason: 'TRACK2_V3_OCR_PROVIDER_ERROR',
      textBlocks: [],
      providerErrors: [
        providerError(
          'TRACK2_V3_OCR_PROVIDER_ERROR',
          safeString(error?.message || 'Cheap OCR provider failed.', 500),
        ),
      ],
      imageCount,
    }
  }
}
