import { extractOcrEvidenceWithProvider } from '../ocrProviders/index.js'
import { fetchPublicImageBuffer } from '../socialUrlExtractionService.js'
import { resolveBlogUrl } from '../socialUrlProviders/blogUrlProvider.js'
import { resolveGenericSocialUrl } from '../socialUrlProviders/genericSocialUrlProvider.js'
import { resolveYouTubeUrl } from '../socialUrlProviders/youtubeUrlProvider.js'
import { extractYouTubeFrames } from './youtubeFrameExtractionService.js'
import {
  buildYoutubeFrameOcrVariants,
  inspectYoutubeFrameOcrEvidence,
} from './youtubeFrameOcrVariantService.js'
import {
  isVietnamAddressEvidence,
  isWeakVietnamAddressText,
} from './vietnamAddressLexicon.js'

const WARNING_CODES = new Set([
  'youtube_frame_scan_disabled',
  'youtube_frame_scan_not_youtube',
  'youtube_frame_scan_binary_missing',
  'youtube_frame_scan_duration_unavailable',
  'youtube_frame_scan_duration_exceeded',
  'youtube_metadata_duration_unavailable',
  'youtube_duration_resolved_by_ffprobe',
  'youtube_frame_scan_skipped_duration_unavailable',
  'youtube_frame_scan_skipped_duration_too_long',
  'youtube_frame_scan_download_failed',
  'youtube_frame_scan_extract_failed',
  'youtube_frame_scan_timeout',
  'youtube_frame_scan_no_frames',
  'youtube_frame_scan_cleanup_failed',
  'speech_to_text_timeout',
  'speech_to_text_failed',
  'speech_to_text_unavailable',
  'temporary_file_cleanup_failed',
  'youtube_api_timeout',
  'youtube_api_invalid_response',
  'youtube_api_fetch_failed',
  'youtube_quota_exceeded',
  'youtube_api_key_invalid',
  'youtube_api_forbidden_or_disabled',
  'youtube_api_key_missing',
  'youtube_video_not_found_or_unavailable',
  'youtube_oembed_unavailable',
  'youtube_video_id_invalid',
  'metadata_blocked_or_empty',
  'weak_url_metadata',
  'generic_social_metadata_limited',
  'unsupported_social_video_metadata',
  'thumbnail_ocr_failed',
  'metadata_image_download_failed',
  'metadata_provider_failed',
  'uploaded_image_ocr_failed',
  'google_vision_timeout',
  'google_vision_failed',
  'tesseract_ocr_failed',
])
const MAX_FRAME_OCR_ATTEMPTS = 72

function capText(value, maximumLength = 700) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximumLength)
}

function warningCode(value, fallback = 'provider_warning') {
  const code = capText(value, 100).toLowerCase()
  if (WARNING_CODES.has(code)) return code
  if (/^[a-z0-9_]{2,80}$/.test(code)) return code
  if (/timeout/i.test(code)) return `${fallback}_timeout`
  if (/blocked|forbidden|quota/i.test(code)) return `${fallback}_unavailable`
  return fallback
}

function uniqueWarnings(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => warningCode(value))
        .filter(Boolean),
    ),
  ].slice(0, 16)
}

function withTimeout(operation, timeoutMs, code) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(code)
      error.code = code
      reject(error)
    }, timeoutMs)

    Promise.resolve()
      .then(operation)
      .then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        },
      )
  })
}

function providerForInput(input, dependencies) {
  if (input.type === 'youtube_url') return dependencies.youtubeProvider
  if (input.type === 'blog_url') return dependencies.blogProvider
  return dependencies.genericSocialProvider
}

function providerWarning(error, prefix) {
  const code = String(error?.code || '').trim().toLowerCase()
  if (WARNING_CODES.has(code)) return code
  if (error?.name === 'AbortError' || /timeout/i.test(code)) {
    return `${prefix}_timeout`
  }
  return `${prefix}_failed`
}

function textsFromProviderResult(result = {}) {
  const values = Array.isArray(result.texts)
    ? result.texts
    : Array.isArray(result.transcripts)
      ? result.transcripts
      : Array.isArray(result)
        ? result
        : []
  return values
    .map((value) =>
      typeof value === 'string' ? capText(value, 500) : capText(value?.text, 500),
    )
    .filter(Boolean)
    .slice(0, 12)
}

function frameEvidenceLines(evidence = null) {
  if (!evidence || evidence.usable !== true) return []
  const tiered = [
    ...(Array.isArray(evidence.strongLines) ? evidence.strongLines : []),
    ...(Array.isArray(evidence.weakLines) ? evidence.weakLines : []),
  ]
  const sourceLines = tiered.length
    ? tiered
    : Array.isArray(evidence.lines)
      ? evidence.lines
      : []
  const lines = sourceLines
    .map((line) => ({
      text: capText(line?.text, 220),
      confidence: Math.max(
        0,
        Math.min(1, Number(line?.confidence ?? evidence.confidence) || 0),
      ),
      type: capText(line?.type || 'other', 30),
      tier: capText(line?.tier || '', 20),
    }))
    .filter((line) => line.text)
    .slice(0, 8)
  if (lines.length || !evidence.text) return lines
  return String(evidence.text)
    .split(/\r?\n/)
    .map((text) => ({
      text: capText(text, 220),
      confidence: Math.max(
        0,
        Math.min(1, Number(evidence.confidence) || 0),
      ),
      type: 'other',
      tier: '',
    }))
    .filter((line) => line.text)
    .slice(0, 8)
}

function boundedFrameOcrEvidence(
  evidence,
  timestampSeconds,
  sourceCrop = 'full',
) {
  const inspected = inspectYoutubeFrameOcrEvidence(evidence, { sourceCrop })
  const lines = inspected.lines
  if (!lines.length) return null
  return {
    source: 'youtube_frame_ocr',
    timestampSeconds: Number.isFinite(Number(timestampSeconds))
      ? Math.round(Number(timestampSeconds) * 1000) / 1000
      : null,
    lines,
    confidence: Math.max(
      0,
      Math.min(
        1,
        Number(evidence?.confidence) ||
          Math.max(...lines.map((line) => line.confidence), 0),
      ),
    ),
    sourceCrop: capText(sourceCrop, 40),
    warnings: uniqueWarnings(evidence?.warnings || []).slice(0, 4),
  }
}

function strongPreFrameEvidence(metadata, thumbnailOcrEvidence) {
  const strongThumbnailLines = frameEvidenceLines(thumbnailOcrEvidence).filter(
    (line) =>
      Number(line.confidence || 0) >= 0.72 &&
      ['address', 'phone', 'sign'].includes(line.type),
  )
  const strongThumbnailAddress = strongThumbnailLines.some(
    (line) =>
      line.type === 'address' &&
      !isWeakVietnamAddressText(line.text) &&
      isVietnamAddressEvidence(line.text, { requireArea: true }),
  )
  if (
    strongThumbnailAddress ||
    (
      strongThumbnailLines.some((line) => line.type === 'sign') &&
      (
        strongThumbnailAddress ||
        strongThumbnailLines.some((line) => line.type === 'phone')
      )
    )
  ) {
    return true
  }
  return (Array.isArray(metadata) ? metadata : []).some(
    (source) =>
      source?.type === 'json_ld' &&
      Number(source?.confidence || 0) >= 0.65 &&
      /(?:address|telephone|phone)\s*:/i.test(String(source?.text || '')),
  )
}

async function cleanupProviderResult(
  result,
  warnings,
  cleanupWarning = 'temporary_file_cleanup_failed',
) {
  if (typeof result?.cleanup !== 'function') return
  try {
    await result.cleanup()
  } catch {
    warnings.push(cleanupWarning)
  }
}

async function unavailableSpeechTranscriber() {
  return {
    transcripts: [],
    warnings: ['speech_to_text_unavailable'],
  }
}

export async function collectVisionEvidence(
  {
    input,
    image = null,
    config = {},
  } = {},
  {
    youtubeProvider = resolveYouTubeUrl,
    blogProvider = resolveBlogUrl,
    genericSocialProvider = resolveGenericSocialUrl,
    extractOcr = extractOcrEvidenceWithProvider,
    downloadImage = fetchPublicImageBuffer,
    frameScanner = extractYouTubeFrames,
    frameVariantBuilder = buildYoutubeFrameOcrVariants,
    speechTranscriber = unavailableSpeechTranscriber,
    providerOptions = {},
  } = {},
) {
  const warnings = []
  const result = {
    metadata: [],
    uploadedOcrEvidence: null,
    thumbnailOcrEvidence: null,
    frameOcrEvidence: [],
    frameTexts: [],
    audioTexts: [],
    warnings,
    debug: {
      metadataStatus: 'not_requested',
      uploadedOcrStatus: 'not_requested',
      thumbnailOcrStatus: 'not_requested',
      frameScanStatus: config.frameScanEnabled ? 'pending' : 'disabled',
      frameScanMode: config.frameScanMode || 'sampled',
      frameDurationSeconds: null,
      frameCount: 0,
      frameOcrAttemptedTimestamps: [],
      speechToTextStatus: config.speechToTextEnabled ? 'pending' : 'disabled',
    },
  }

  if (input?.type === 'uploaded_image') {
    try {
      result.uploadedOcrEvidence = await extractOcr(
        { image },
        {
          provider: 'google_vision',
          fallbackToTesseract: false,
        },
      )
      result.debug.uploadedOcrStatus =
        result.uploadedOcrEvidence?.usable === true
          ? 'usable'
          : result.uploadedOcrEvidence?.reason || 'unusable'
      warnings.push(...(result.uploadedOcrEvidence?.warnings || []))
    } catch (error) {
      result.debug.uploadedOcrStatus = 'failed'
      warnings.push(providerWarning(error, 'uploaded_image_ocr'))
    }
  } else if (input?.url) {
    let providerResult = null
    try {
      const selectedProvider = providerForInput(input, {
        youtubeProvider,
        blogProvider,
        genericSocialProvider,
      })
      providerResult = await selectedProvider(
        {
          url: input.url,
          platform: input.platform,
        },
        providerOptions,
      )
      result.metadata = Array.isArray(providerResult?.textSources)
        ? providerResult.textSources
        : []
      result.debug.metadataStatus =
        providerResult?.debug?.extractionStatus || 'completed'
      result.debug.videoId = capText(providerResult?.debug?.videoId, 32) || null
      warnings.push(...(providerResult?.warnings || []))
    } catch (error) {
      result.debug.metadataStatus = 'failed'
      warnings.push(providerWarning(error, 'metadata_provider'))
    }

    const remoteMedia = (Array.isArray(providerResult?.mediaSources)
      ? providerResult.mediaSources
      : []
    ).find((media) =>
      ['thumbnail', 'og_image'].includes(media?.type) && media?.url,
    )

    if (config.metadataOcrEnabled && remoteMedia?.url) {
      try {
        const downloaded = await downloadImage(
          { url: remoteMedia.url },
          {
            maxResponseBytes: config.metadataOcrMaxBytes,
            timeoutMs: config.metadataOcrTimeoutMs,
          },
        )
        if (downloaded?.status === 'success' && downloaded.buffer) {
          result.thumbnailOcrEvidence = await withTimeout(
            () =>
              extractOcr(
                {
                  image: {
                    buffer: downloaded.buffer,
                    mimetype: downloaded.contentType,
                    originalname: 'vision-auto-metadata-image',
                  },
                },
                {
                  provider: 'google_vision',
                  fallbackToTesseract: false,
                },
              ),
            config.metadataOcrTimeoutMs,
            'thumbnail_ocr_timeout',
          )
          result.debug.thumbnailOcrStatus =
            result.thumbnailOcrEvidence?.usable === true
              ? 'usable'
              : result.thumbnailOcrEvidence?.reason || 'unusable'
          warnings.push(...(result.thumbnailOcrEvidence?.warnings || []))
          if (result.thumbnailOcrEvidence?.usable !== true) {
            warnings.push('thumbnail_ocr_failed')
          }
        } else {
          result.debug.thumbnailOcrStatus = downloaded?.status || 'failed'
          warnings.push('metadata_image_download_failed')
          warnings.push(...(downloaded?.warnings || []))
        }
      } catch (error) {
        result.debug.thumbnailOcrStatus = 'failed'
        warnings.push(providerWarning(error, 'thumbnail_ocr'))
      }
    } else {
      result.debug.thumbnailOcrStatus = config.metadataOcrEnabled
        ? 'not_available'
        : 'disabled'
    }

    if (!config.frameScanEnabled && input.type === 'youtube_url') {
      warnings.push('youtube_frame_scan_disabled')
    } else if (config.frameScanEnabled && input.type !== 'youtube_url') {
      result.debug.frameScanStatus = 'not_youtube'
      warnings.push('youtube_frame_scan_not_youtube')
    } else if (
      input.type === 'youtube_url' &&
      config.frameScanEnabled &&
      strongPreFrameEvidence(result.metadata, result.thumbnailOcrEvidence)
    ) {
      result.debug.frameScanStatus = 'skipped_strong_evidence'
    } else if (input.type === 'youtube_url' && config.frameScanEnabled) {
      let frameResult = null
      const frameScanMaxFrames = Math.max(
        1,
        Math.min(60, Math.round(Number(config.frameScanMaxFrames) || 12)),
      )
      const frameScanTimeoutMs = Math.max(
        500,
        Math.min(
          180_000,
          Math.round(Number(config.frameScanTimeoutMs) || 60_000),
        ),
      )
      try {
        frameResult = await withTimeout(
          () =>
            frameScanner({
              url: input.url,
              videoId: result.debug.videoId,
              maxFrames: frameScanMaxFrames,
              maxDurationSeconds: config.frameScanMaxDurationSeconds,
              timeoutMs: frameScanTimeoutMs,
              downloadTimeoutMs: config.frameDownloadTimeoutMs,
              tempDir: config.frameScanTempDir,
              mode: config.frameScanMode,
            }),
          frameScanTimeoutMs,
          'youtube_frame_scan_timeout',
        )
        warnings.push(...(frameResult?.warnings || []))
        const frames = (Array.isArray(frameResult?.frames)
          ? frameResult.frames
          : []
        )
          .filter(
            (frame) =>
              Buffer.isBuffer(frame?.buffer) &&
              frame.buffer.length > 0,
          )
          .slice(0, frameScanMaxFrames)
        result.debug.frameCount = frames.length
        result.debug.frameScanMode = frameResult?.frameScanMode || config.frameScanMode || 'sampled'
        result.debug.frameDurationSeconds = Number.isFinite(
          Number(frameResult?.durationSeconds),
        ) && Number(frameResult?.durationSeconds) > 0
          ? Number(frameResult.durationSeconds)
          : null
        result.debug.frameMetadataDurationSeconds = Number.isFinite(
          Number(frameResult?.metadataDurationSeconds),
        ) && Number(frameResult?.metadataDurationSeconds) > 0
          ? Number(frameResult.metadataDurationSeconds)
          : null
        result.debug.frameDurationSource = [
          'metadata',
          'ffprobe',
        ].includes(frameResult?.durationSource)
          ? frameResult.durationSource
          : 'unavailable'
        result.debug.frameScanSkippedReason =
          warningCode(frameResult?.frameScanSkippedReason || '', '') || null
        result.debug.frameBinaries = {
          ytDlpAvailable: frameResult?.binaries?.ytDlpAvailable === true,
          ffmpegAvailable: frameResult?.binaries?.ffmpegAvailable === true,
          ffprobeAvailable: frameResult?.binaries?.ffprobeAvailable === true,
        }
        result.debug.frameOcrVariantAttempts = 0
        const frameOcrDeadline = Date.now() + frameScanTimeoutMs
        const variantsByFrame = []
        for (const frame of frames) {
          let variants = [
            {
              label: 'full',
              buffer: frame.buffer,
              mimetype: frame.mimetype || 'image/jpeg',
            },
          ]
          try {
            variants = await frameVariantBuilder({
              frame,
              cropEnabled: config.frameOcrCropEnabled !== false,
              maxCropsPerFrame: config.frameOcrMaxCropsPerFrame,
              upscaleEnabled: config.frameOcrUpscaleEnabled !== false,
            })
          } catch {
            // Full-frame OCR remains available when local crop preparation fails.
          }
          variantsByFrame.push(
            Array.isArray(variants) && variants.length
              ? variants
              : [],
          )
        }

        const scheduledAttempts = []
        const maximumVariantCount = Math.max(
          0,
          ...variantsByFrame.map((variants) => variants.length),
        )
        for (let variantIndex = 0; variantIndex < maximumVariantCount; variantIndex += 1) {
          for (const [frameIndex, variants] of variantsByFrame.entries()) {
            const variant = variants[variantIndex]
            if (!variant) continue
            scheduledAttempts.push({
              frameIndex,
              frame: frames[frameIndex],
              variant,
            })
            if (scheduledAttempts.length >= MAX_FRAME_OCR_ATTEMPTS) break
          }
          if (scheduledAttempts.length >= MAX_FRAME_OCR_ATTEMPTS) break
        }

        const frameStates = frames.map(() => ({
          hasAddress: false,
          hasPhone: false,
        }))
        for (const [attemptIndex, attempt] of scheduledAttempts.entries()) {
          const state = frameStates[attempt.frameIndex]
          if (state.hasAddress && state.hasPhone) continue
          const variantRemainingMs = frameOcrDeadline - Date.now()
          if (variantRemainingMs <= 0) {
            warnings.push('youtube_frame_scan_timeout')
            break
          }
          // Do not divide the remaining global frame budget across all frames.
          // Google Vision often needs more than ~1s per request; dividing the budget
          // caused every frame OCR attempt to time out when MAX_FRAMES was raised.
          const preferredAttemptTimeoutMs = Math.max(
            3_000,
            Math.min(Number(config.googleVisionTimeoutMs || 15_000), 30_000),
          )
          const attemptTimeoutMs = Math.max(
            1_500,
            Math.min(variantRemainingMs, preferredAttemptTimeoutMs),
          )
          result.debug.frameOcrVariantAttempts += 1
          if (
            Number.isFinite(Number(attempt.frame.timestampSeconds)) &&
            !result.debug.frameOcrAttemptedTimestamps.includes(
              Number(attempt.frame.timestampSeconds),
            )
          ) {
            result.debug.frameOcrAttemptedTimestamps.push(
              Number(attempt.frame.timestampSeconds),
            )
          }
          try {
            const ocrEvidence = await withTimeout(
              () =>
                extractOcr(
                  {
                    image: {
                      buffer: attempt.variant.buffer,
                      mimetype: attempt.variant.mimetype || 'image/jpeg',
                      originalname: 'vision-auto-youtube-frame.jpg',
                      frameIndex: attempt.frameIndex + 1,
                      timestampSeconds: attempt.frame.timestampSeconds,
                      sourceCrop: capText(
                        attempt.variant.label || 'full',
                        40,
                      ),
                    },
                  },
                  {
                    provider: 'google_vision',
                    fallbackToTesseract: false,
                  },
                ),
              attemptTimeoutMs,
              'youtube_frame_scan_timeout',
            )
            warnings.push(...(ocrEvidence?.warnings || []))
            const bounded = boundedFrameOcrEvidence(
              ocrEvidence,
              attempt.frame.timestampSeconds,
              attempt.variant.label || 'full',
            )
            if (bounded) {
              result.frameOcrEvidence.push(bounded)
              state.hasAddress ||= bounded.lines.some(
                (line) => line.type === 'address',
              )
              state.hasPhone ||= bounded.lines.some(
                (line) => line.type === 'phone',
              )
            }
          } catch (error) {
            const warning = providerWarning(error, 'youtube_frame_scan')
            warnings.push(warning)
            if (warning === 'youtube_frame_scan_timeout') break
          }
        }

        result.frameTexts = result.frameOcrEvidence
          .flatMap((frame) => frame.lines.map((line) => line.text))
          .filter(Boolean)
          .slice(0, 60)
        if (!frames.length && !frameResult?.warnings?.length) {
          warnings.push('youtube_frame_scan_no_frames')
        }
        result.debug.frameOcrLineCount = result.frameTexts.length
        result.debug.frameScanStatus = result.frameTexts.length
          ? 'usable'
          : frames.length
            ? 'ocr_empty'
            : 'empty'

        if (!frames.length && textsFromProviderResult(frameResult).length) {
          result.frameTexts = textsFromProviderResult(frameResult)
          result.frameOcrEvidence = result.frameTexts.map((text) => ({
            source: 'youtube_frame_ocr',
            timestampSeconds: null,
            lines: [
              {
                text,
                confidence: 0.45,
                type: 'other',
                tier: '',
              },
            ],
            confidence: 0.45,
            warnings: [],
          }))
          result.debug.frameOcrLineCount = result.frameTexts.length
          result.debug.frameScanStatus = 'usable'
        }
      } catch (error) {
        result.debug.frameScanStatus = 'failed'
        warnings.push(providerWarning(error, 'youtube_frame_scan'))
      } finally {
        await cleanupProviderResult(
          frameResult,
          warnings,
          'youtube_frame_scan_cleanup_failed',
        )
      }
    }

    if (input.type === 'youtube_url' && config.speechToTextEnabled) {
      let speechResult = null
      try {
        speechResult = await withTimeout(
          () =>
            speechTranscriber({
              url: input.url,
              videoId: result.debug.videoId,
              timeoutMs: config.speechToTextTimeoutMs,
            }),
          config.speechToTextTimeoutMs,
          'speech_to_text_timeout',
        )
        result.audioTexts = textsFromProviderResult(speechResult)
        result.debug.speechToTextStatus = result.audioTexts.length
          ? 'usable'
          : 'empty'
        warnings.push(...(speechResult?.warnings || []))
      } catch (error) {
        result.debug.speechToTextStatus = 'failed'
        warnings.push(providerWarning(error, 'speech_to_text'))
      } finally {
        await cleanupProviderResult(speechResult, warnings)
      }
    }
  }

  result.warnings = uniqueWarnings(warnings)
  return result
}
