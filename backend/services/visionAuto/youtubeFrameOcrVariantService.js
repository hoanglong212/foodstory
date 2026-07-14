import sharp from "sharp";
import {
  hasVietnamStreetName,
  isVietnamAddressEvidence,
  isWeakVietnamAddressText,
} from "./vietnamAddressLexicon.js";

const MAX_FRAME_OCR_LINES = 8;
const MAX_DIAGNOSTIC_CANDIDATES = 16;
const MAX_RAW_TEXT_LINES = 24;
const MAX_CROP_VARIANTS = 4;
const MAX_VARIANT_BYTES = 4 * 1024 * 1024;

const CROP_DEFINITIONS = Object.freeze([
  {
    label: "lower_center",
    left: 0.03,
    top: 0.42,
    width: 0.94,
    height: 0.42,
  },
  {
    label: "center",
    left: 0.05,
    top: 0.18,
    width: 0.9,
    height: 0.64,
  },
  {
    label: "middle",
    left: 0.03,
    top: 0.28,
    width: 0.94,
    height: 0.46,
  },
  {
    label: "upper_center",
    left: 0.05,
    top: 0.04,
    width: 0.9,
    height: 0.52,
  },
]);

function capText(value, maximumLength = 220) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

function roundScore(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 1000) / 1000;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueByText(values, maximum = MAX_DIAGNOSTIC_CANDIDATES) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = capText(value?.text);
    const key = normalizeText(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...value, text });
    if (result.length >= maximum) break;
  }
  return result;
}

function menuOrScheduleText(value) {
  return /\b(?:thu hai|thu ba|thu tu|thu nam|thu sau|thu bay|chu nhat|tuan|mon|com|pho|bun|banh|hu tieu|mi|chao|lau|ca ri)\b/.test(
    normalizeText(value),
  );
}

function normalizeSlashHouseNumberSpacing(value) {
  return capText(value)
    .replace(
      /(?<!\d)(\d{1,3})\s+(\d{1,3})(?=\s*[/-]\s*\d{1,5}[a-z]?\b)/giu,
      (match, left, right) => {
        const joined = `${left}${right}`;
        return joined.length <= 5 ? joined : match;
      },
    )
    .replace(/(?<=\d)\s*([/-])\s*(?=\d)/gu, "$1");
}

function embeddedAddressCandidates(value) {
  const source = normalizeSlashHouseNumberSpacing(value);
  const candidates = [];
  for (const match of source.matchAll(
    /(?<!\d)\d{1,5}[a-z]?[/-]\d{1,5}[a-z]?\b/giu,
  )) {
    const start = Number(match.index || 0);
    const tail = source.slice(start);
    const afterHouse = tail.slice(match[0].length);
    const boundaryMatches = [
      afterHouse.search(
        /\s+(?:đt|dt|sđt|sdt|tel|phone|hotline|điện thoại|dien thoai)\s*[:.-]?/iu,
      ),
      afterHouse.search(/\s+0(?:[\s.()/-]*\d){8,10}/u),
      afterHouse.search(
        /\s+(?:(?:\d+\s*)?(?:tuần|tuan|món|mon)\b|(?:thứ|thu)\s+(?:hai|ba|tư|tu|năm|nam|sáu|sau|bảy|bay)\b|(?:chủ nhật|chu nhat)\b)/iu,
      ),
    ].filter((index) => index >= 0);
    const end =
      boundaryMatches.length > 0
        ? match[0].length + Math.min(...boundaryMatches)
        : tail.length;
    const candidate = capText(tail.slice(0, end).replace(/[\s,;:|–—-]+$/u, ""));
    if (
      candidate &&
      addressShape(candidate) &&
      !candidates.some(
        (item) => normalizeText(item) === normalizeText(candidate),
      )
    ) {
      candidates.push(candidate);
    }
  }
  return candidates.slice(0, 3);
}

function formattedPhone(normalized) {
  if (/^0[35789]\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 3)}.${normalized.slice(3, 6)}.${normalized.slice(6)}`;
  }
  return normalized;
}

function phoneMatches(value, { addressCandidates = [] } = {}) {
  const source = capText(value);
  const hasContext =
    hasPhoneLabel(source) ||
    (Array.isArray(addressCandidates) && addressCandidates.length > 0);
  if (!hasContext) return [];
  const matches = [];
  const pattern = /(?<!\d)0(?:[\s.()/-]*\d){9}/gu;
  for (const match of source.matchAll(pattern)) {
    const raw = capText(match[0], 40);
    const digits = raw.replace(/\D/g, "");
    if (!/^0[35789]\d{8}$/.test(digits) && !/^02\d{8,9}$/.test(digits)) {
      continue;
    }
    const end = Number(match.index || 0) + match[0].length;
    const suffix = source.slice(end);
    if (
      /^\d/u.test(suffix) &&
      !/^\d\s*(?:tuần|tuan|món|mon|thứ|thu|chủ nhật|chu nhat)\b/iu.test(suffix)
    ) {
      continue;
    }
    if (!matches.some((item) => item.normalized === digits)) {
      matches.push({
        raw: formattedPhone(digits),
        normalized: digits,
      });
    }
  }
  return matches.slice(0, 4);
}

function hasPhoneLabel(value) {
  return /(?:^|[^\p{L}\p{N}])(?:đt|dt|sđt|sdt|tel|phone|hotline|điện thoại|dien thoai)\s*[:.-]?/iu.test(
    String(value || ""),
  );
}

function addressShape(value) {
  const source = normalizeSlashHouseNumberSpacing(value);
  if (isWeakVietnamAddressText(source) || !hasVietnamStreetName(source)) {
    return null;
  }
  const normalized = normalizeText(source);
  const match = source.match(/(?<!\d)\d{1,5}[a-z]?(?:[/-]\d{1,5}[a-z]?)?\b/iu);
  if (!match) return null;
  const houseNumber = String(match[0]).replace(/\s+/g, "").toLowerCase();
  const slashHouseNumber = /[/-]/.test(houseNumber);
  const afterNumber = normalizeText(
    source.slice(Number(match.index || 0) + match[0].length),
  );
  const streetWords = afterNumber
    .split(" ")
    .filter(
      (word) =>
        /^[a-z]{2,}$/.test(word) &&
        ![
          "duong",
          "street",
          "road",
          "hem",
          "ngo",
          "phuong",
          "ward",
          "quan",
          "district",
          "city",
          "tinh",
        ].includes(word),
    );
  const hasStreetIndicator =
    /\b(?:duong|street|road|avenue|boulevard|hem|ngo)\b/.test(normalized) ||
    /(?:^|[\s,;])(?:đ|d)\s*\.(?=\s*[\p{L}\d])/iu.test(source);
  const hasAdmin =
    /\b(?:p|q)\s*\.?\s*\d{1,2}\b/.test(normalized) ||
    /\b(?:phuong|ward|quan|district|thanh pho|city|province|tinh)\b/.test(
      normalized,
    );
  const strong =
    (slashHouseNumber && streetWords.length >= 2) ||
    (hasStreetIndicator && streetWords.length >= 1) ||
    (hasAdmin && streetWords.length >= 1);
  return strong
    ? {
        houseNumber,
        slashHouseNumber,
        streetWordCount: streetWords.length,
        hasStreetIndicator,
        hasAdmin,
      }
    : null;
}

function frameTextType(value, fallbackType = "other") {
  const text = capText(value);
  const normalized = normalizeText(text);
  if (menuOrScheduleText(normalized)) return "menu";
  if (addressShape(text)) return "address";
  if (
    phoneMatches(text, {
      addressCandidates: embeddedAddressCandidates(text),
    }).length
  )
    return "phone";
  if (
    /\b(?:nay|la|nhau|vua|du|thiet|khong|roi|luon|day|kia)\b/.test(normalized)
  ) {
    return "subtitle";
  }
  if (
    fallbackType === "address" &&
    !isVietnamAddressEvidence(text, { requireArea: false })
  ) {
    return "other";
  }
  return ["address", "phone", "sign", "other"].includes(fallbackType)
    ? fallbackType
    : "other";
}

export function recoverEmbeddedYoutubeFrameEntities(value) {
  const evidenceText = capText(value);
  const addressCandidates = embeddedAddressCandidates(evidenceText);
  const phones = phoneMatches(evidenceText, { addressCandidates }).map(
    (phone) => phone.raw,
  );
  return {
    addressCandidates,
    phones,
  };
}

function candidateConfidence(candidate, evidence, type) {
  const value =
    Number(candidate?.confidence) ||
    Number(candidate?.quality) ||
    Number(evidence?.confidence) ||
    0;
  if (type === "address") return roundScore(Math.max(0.58, value));
  if (type === "phone") return roundScore(Math.max(0.56, value));
  return roundScore(value);
}

function rawEvidenceCandidates(evidence, sourceCrop) {
  const values = [];
  const add = (line, origin) => {
    const text = capText(line && typeof line === "object" ? line.text : line);
    if (!text) return;
    const type = frameTextType(text, line?.type);
    values.push({
      text,
      type,
      confidence: candidateConfidence(line, evidence, type),
      sourceCrop,
      origin,
      tier: capText(line?.tier, 20),
    });
  };

  for (const line of Array.isArray(evidence?.strongLines)
    ? evidence.strongLines
    : []) {
    add(line, "strong_line");
  }
  for (const line of Array.isArray(evidence?.weakLines)
    ? evidence.weakLines
    : []) {
    add(line, "weak_line");
  }
  for (const line of Array.isArray(evidence?.lines) ? evidence.lines : []) {
    add(line, "selected_line");
  }
  for (const line of Array.isArray(evidence?.debug?.canonicalClusters)
    ? evidence.debug.canonicalClusters
    : []) {
    add(line, "canonical_cluster");
  }
  for (const line of Array.isArray(evidence?.debug?.rejectedLines)
    ? evidence.debug.rejectedLines
    : []) {
    add(line, "rejected_line");
  }

  const rawText = String(evidence?.debug?.rawText || "");
  for (const text of rawText.split(/\r?\n/).slice(0, MAX_RAW_TEXT_LINES)) {
    add({ text }, "raw_text");
  }

  return uniqueByText(values);
}

function selectedEvidenceKeys(evidence) {
  return new Set(
    [
      ...(Array.isArray(evidence?.lines) ? evidence.lines : []),
      ...(Array.isArray(evidence?.strongLines) ? evidence.strongLines : []),
      ...(Array.isArray(evidence?.weakLines) ? evidence.weakLines : []),
    ]
      .map((line) => normalizeText(line?.text))
      .filter(Boolean),
  );
}

export function inspectYoutubeFrameOcrEvidence(
  evidence,
  { sourceCrop = "full" } = {},
) {
  const candidates = rawEvidenceCandidates(evidence, sourceCrop);
  const selectedKeys = selectedEvidenceKeys(evidence);
  const kept = [];
  const recoveredAddresses = [];
  const recoveredPhones = [];

  for (const candidate of candidates) {
    const recovered = recoverEmbeddedYoutubeFrameEntities(candidate.text);
    for (const address of recovered.addressCandidates) {
      recoveredAddresses.push(address);
      kept.push({
        text: address,
        confidence: Math.max(0.62, candidate.confidence),
        type: "address",
        tier: "strong",
        sourceCrop,
        evidenceText: candidate.text,
      });
    }
    for (const phone of recovered.phones) {
      recoveredPhones.push(phone);
      kept.push({
        text: `ĐT: ${phone}`,
        confidence: Math.max(0.6, candidate.confidence),
        type: "phone",
        tier: "strong",
        sourceCrop,
        evidenceText: candidate.text,
      });
    }
    const selected = selectedKeys.has(normalizeText(candidate.text));
    const structural =
      candidate.type === "address" || candidate.type === "phone";
    if (!selected && !structural) continue;
    if (
      !structural &&
      ["subtitle", "menu"].includes(candidate.type) &&
      candidate.origin === "raw_text"
    ) {
      continue;
    }
    kept.push({
      text: candidate.text,
      confidence: candidateConfidence(candidate, evidence, candidate.type),
      type:
        candidate.type === "menu" || candidate.type === "subtitle"
          ? "other"
          : candidate.type,
      tier: structural ? "strong" : candidate.tier || "",
      sourceCrop,
      evidenceText: candidate.text,
    });
  }

  const priority = {
    address: 4,
    phone: 3,
    sign: 2,
    other: 1,
  };
  const lines = uniqueByText(kept, MAX_FRAME_OCR_LINES)
    .sort(
      (left, right) =>
        (priority[right.type] || 0) - (priority[left.type] || 0) ||
        right.confidence - left.confidence,
    )
    .slice(0, MAX_FRAME_OCR_LINES);

  return {
    rawCandidateCount: candidates.length,
    topRawCandidates: candidates.slice(0, 8).map((candidate) => ({
      text: candidate.text,
      type: candidate.type,
      confidence: candidate.confidence,
      sourceCrop: candidate.sourceCrop,
    })),
    lines,
    recoveredEntities: {
      addressCandidates: [
        ...new Set(recoveredAddresses.map((value) => capText(value))),
      ].slice(0, 3),
      phones: [
        ...new Set(recoveredPhones.map((value) => capText(value, 40))),
      ].slice(0, 4),
    },
  };
}

function cropRectangle(metadata, definition) {
  const width = Math.max(1, Number(metadata?.width) || 0);
  const height = Math.max(1, Number(metadata?.height) || 0);
  if (width < 2 || height < 2) return null;
  const left = Math.max(0, Math.floor(width * definition.left));
  const top = Math.max(0, Math.floor(height * definition.top));
  const cropWidth = Math.min(
    width - left,
    Math.max(1, Math.floor(width * definition.width)),
  );
  const cropHeight = Math.min(
    height - top,
    Math.max(1, Math.floor(height * definition.height)),
  );
  if (cropWidth < 64 || cropHeight < 64) return null;
  return { left, top, width: cropWidth, height: cropHeight };
}

export async function buildYoutubeFrameOcrVariants(
  {
    frame,
    cropEnabled = true,
    maxCropsPerFrame = 4,
    upscaleEnabled = true,
  } = {},
  { imageFactory = sharp } = {},
) {
  if (!Buffer.isBuffer(frame?.buffer) || !frame.buffer.length) return [];
  const variants = [
    {
      label: "full",
      buffer: frame.buffer,
      mimetype: frame.mimetype || "image/jpeg",
    },
  ];
  if (!cropEnabled) return variants;

  const boundedCropCount = Math.max(
    0,
    Math.min(MAX_CROP_VARIANTS, Math.round(Number(maxCropsPerFrame) || 0)),
  );
  if (!boundedCropCount) return variants;

  let metadata;
  try {
    metadata = await imageFactory(frame.buffer, { failOn: "none" })
      .rotate()
      .metadata();
  } catch {
    return variants;
  }

  for (const definition of CROP_DEFINITIONS.slice(0, boundedCropCount)) {
    const rectangle = cropRectangle(metadata, definition);
    if (!rectangle) continue;
    try {
      let pipeline = imageFactory(frame.buffer, { failOn: "none" })
        .rotate()
        .extract(rectangle);
      if (upscaleEnabled) {
        pipeline = pipeline.resize({
          width: Math.min(1_920, Math.max(1_280, rectangle.width * 2)),
          withoutEnlargement: false,
        });
      }
      const buffer = await pipeline
        .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
        .toBuffer();
      if (
        Buffer.isBuffer(buffer) &&
        buffer.length > 0 &&
        buffer.length <= MAX_VARIANT_BYTES
      ) {
        variants.push({
          label: definition.label,
          buffer,
          mimetype: "image/jpeg",
        });
      }
    } catch {
      // A failed crop must not discard the full-frame OCR attempt.
    }
  }

  return variants;
}

export {
  CROP_DEFINITIONS as YOUTUBE_FRAME_OCR_CROP_DEFINITIONS,
  MAX_CROP_VARIANTS as YOUTUBE_FRAME_OCR_MAX_CROP_VARIANTS,
};
