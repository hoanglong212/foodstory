export {
  DEFAULT_SHORTS_TRACK2_V3_CONFIG,
  getShortsTrack2V3Config,
  isShortsTrack2V3Enabled,
} from './shortsTrack2V3Config.js'
export { runShortsTrack2V3Pipeline } from './shortsTrack2V3PipelineService.js'
export {
  SHORTS_TRACK2_V3_INPUT_CLASSES,
  classifyShortsTrack2V3Intent,
  normalizeShortsTrack2V3IntentText,
} from './shortsTrack2V3IntentClassifierService.js'
export { planShortsTrack2V3Frames } from './shortsTrack2V3FramePlannerService.js'
export { buildShortsTrack2V3FrameVariants } from './shortsTrack2V3FrameVariantService.js'
export { runShortsTrack2V3CheapOcr } from './shortsTrack2V3OcrProviderService.js'
export {
  normalizeShortsTrack2V3LocalOcrConfig,
  runShortsTrack2V3LocalOcrProvider,
} from './shortsTrack2V3LocalOcrProviderService.js'
export { runShortsTrack2V3SmartOverlayOcr } from './shortsTrack2V3SmartOverlayOcrService.js'
export {
  ASR_EVIDENCE_TYPES,
  CORROBORATION_TYPES,
  buildShortsTrack2V3AsrReviewCandidates,
  corroborateShortsTrack2V3AsrEvidence,
  directlyTranscribedNumberForms,
  extractShortsTrack2V3AsrEvidence,
} from './shortsTrack2V3AsrEvidenceService.js'
export {
  cleanupShortsTrack2V3LocalAsrProviders,
  runShortsTrack2V3AsrProvider,
  runShortsTrack2V3LocalAsrProvider,
} from './shortsTrack2V3AsrProviderService.js'
export {
  createShortsTrack2V3MediaSession,
  SHORTS_TRACK2_V3_MEDIA_FORMAT_STRATEGIES,
} from './shortsTrack2V3MediaSessionService.js'
export {
  SHORTS_TRACK2_V3_ASR_FALLBACK_REASONS,
  runShortsTrack2V3AsrFallback,
} from './shortsTrack2V3AsrFallbackService.js'
export {
  buildShortsTrack2V3AdaptiveSampleTimestamps,
  decideShortsTrack2V3AdaptiveFrameSampling,
  runShortsTrack2V3AdaptiveFrameSampling,
} from './shortsTrack2V3AdaptiveFrameSamplingService.js'
export {
  SHORTS_TRACK2_V3_GEMINI_CROP_JUDGE_AGGREGATE_STATUSES,
  SHORTS_TRACK2_V3_GEMINI_PROVIDER_ERROR_CLASSES,
  parseShortsTrack2V3GeminiCropJudgeResponse,
  runShortsTrack2V3GeminiCropJudge,
  validateShortsTrack2V3GeminiCropIds,
} from './shortsTrack2V3GeminiCropJudgeService.js'
export {
  createShortsTrack2V3GeminiRequestScheduler,
} from './shortsTrack2V3GeminiRequestSchedulerService.js'
export { generateShortsTrack2V3TesseractPreprocessVariants } from './shortsTrack2V3TesseractPreprocessService.js'
export {
  scoreShortsTrack2V3TesseractOutput,
  selectBestShortsTrack2V3TesseractAttempt,
} from './shortsTrack2V3TesseractOcrScoringService.js'
export {
  runTrack2V3CheapOcrLive,
  runTrack2V3OcrBoostLive,
} from './shortsTrack2V3LiveCheapOcrAdapter.js'
export {
  createShortsTrack2V3EvidenceStore,
  collectShortsTrack2V3Evidence,
  buildShortsTrack2V3EvidenceFromOcrBlocks,
  detectShortsTrack2V3EvidenceTokens,
  foldVietnameseText,
  normalizeShortsTrack2V3Text,
} from './shortsTrack2V3EvidenceStoreService.js'
export { buildShortsTrack2V3Candidates } from './shortsTrack2V3CandidateBuilderService.js'
export {
  extractMetadataEvidence,
  buildMetadataCandidatesFromEvidence,
  mergeMetadataCandidatesWithExisting,
} from './shortsTrack2V3MetadataEvidenceService.js'
export {
  applyShortsTrack2V3CandidateQualityGate,
  evaluateShortsTrack2V3CandidateQuality,
  SHORTS_TRACK2_V3_CANDIDATE_KEEP_REASONS,
  SHORTS_TRACK2_V3_CANDIDATE_DROP_REASONS,
} from './shortsTrack2V3CandidateQualityGateService.js'
export {
  classifyShortsTrack2V3NumericContexts,
  isShortsTrack2V3RejectedHouseNumberContext,
  SHORTS_TRACK2_V3_NUMERIC_CONTEXT_CLASSES,
} from './shortsTrack2V3NumericContextSafetyService.js'
export {
  evaluateShortsTrack2V3LateRescueSufficiency,
  SHORTS_TRACK2_V3_LATE_RESCUE_REASONS,
} from './shortsTrack2V3LateRescueSufficiencyService.js'
export { decideShortsTrack2V3Escalation } from './shortsTrack2V3EscalationService.js'
export { runShortsTrack2V3OcrBoost } from './shortsTrack2V3OcrBoostService.js'
export { runShortsTrack2V3GeminiVision } from './shortsTrack2V3GeminiVisionService.js'
export { fuseShortsTrack2V3Evidence } from './shortsTrack2V3EvidenceFusionService.js'
export { runShortsTrack2V3PlacesUpgrade } from './shortsTrack2V3PlacesUpgradeService.js'
export { decideShortsTrack2V3Result } from './shortsTrack2V3DecisionService.js'
export { buildShortsTrack2V3Response } from './shortsTrack2V3ResponseBuilder.js'
export { buildShortsTrack2V3DebugFrameReport } from './shortsTrack2V3DebugFrameReportService.js'
export {
  SMART_OVERLAY_CROP_VARIANTS,
  buildShortsTrack2V3SmartOverlaySampleTimestamps,
  createShortsTrack2V3SmartOverlayFrameExtractor,
  normalizeShortsTrack2V3SmartOverlayConfig,
  selectShortsTrack2V3SmartOverlayCrops,
  runShortsTrack2V3SmartOverlayDryRun,
} from './shortsTrack2V3SmartOverlaySelectorService.js'
export { writeShortsTrack2V3SelectorDiagnostics } from './shortsTrack2V3SelectorDiagnosticsService.js'
export {
  summarizeShortsTrack2V3AuditCase,
  buildShortsTrack2V3AuditSummary,
  assertShortsTrack2V3AuditSafe,
} from './shortsTrack2V3AuditService.js'

export { proposeShortsTrack2V3TextRegions } from './shortsTrack2V3TextRegionProposalService.js'
export { buildShortsTrack2V3TemporalTextEpisodes } from './shortsTrack2V3TemporalTextEpisodeService.js'
export { buildShortsTrack2V3TemporalOcrConsensus } from './shortsTrack2V3TemporalOcrConsensusService.js'
export { buildShortsTrack2V3AsrOpportunityWindows } from './shortsTrack2V3AsrOpportunityWindowService.js'
export {
  SHORTS_TRACK2_V3_ADDRESS_SIGNAL_CLASSES,
  analyzeShortsTrack2V3AddressSignal,
  areShortsTrack2V3AddressSignalsComplementary,
} from './shortsTrack2V3AddressSignalService.js'
export { writeShortsTrack2V3LiveDiagnostics } from './shortsTrack2V3LiveDiagnosticsService.js'
