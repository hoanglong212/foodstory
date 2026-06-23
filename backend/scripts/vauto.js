import { analyzeVisionAutoV2 } from "../services/visionAuto/visionAutoResolverService.js";

const url = process.argv[2];

if (!url) {
  console.error('Usage: npm run vauto -- "https://www.youtube.com/shorts/..."');
  process.exit(1);
}

function valueOf(entity) {
  return entity?.value ?? entity ?? null;
}

function listOf(values) {
  return Array.isArray(values) ? values.map(valueOf).filter(Boolean) : [];
}

const result = await analyzeVisionAutoV2({ url });

const output = {
  status: result.status,
  confidence: result.confidence,
  reason: result.reason,
  placeName: valueOf(result.entities?.placeName),
  address: valueOf(result.entities?.address),
  phones: listOf(result.entities?.phones),
  dishes: listOf(result.entities?.dishNames),
  locationHints: listOf(result.entities?.locationHints),
  draft: result.addPlaceDraft,

  evidenceFrameTexts: result.evidenceSummary?.frameTexts || [],
  evidenceFrameEvidence: result.evidenceSummary?.frameEvidence || [],
  evidenceOcrLines: result.evidenceSummary?.ocrLines || [],

  warnings: result.debug?.warnings || result.warnings || [],
  steps: result.debug?.steps || result.steps || [],
};

console.log(JSON.stringify(output, null, 2));
