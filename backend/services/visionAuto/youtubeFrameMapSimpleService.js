import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { extractOcrEvidenceWithProvider } from "../ocrProviders/index.js";
import { resolveYouTubeUrl } from "../socialUrlProviders/youtubeUrlProvider.js";
import { extractYouTubeFrames } from "./youtubeFrameExtractionService.js";
import {
  hasVietnamAdminOrArea,
  hasVietnamHouseNumber,
  hasVietnamStreetName,
  isWeakVietnamAddressText,
} from "./vietnamAddressLexicon.js";

const GOOGLE_TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";
const MAX_QUERY_TEXT = 900;

function capText(value, maximumLength = 700) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

function normalizeVietnamese(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9.\s:/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roundConfidence(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.max(0, Math.min(1, number)) * 1000) / 1000;
}

function uniqueByKey(values, keyFn, maximumItems = 12) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const key = keyFn(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= maximumItems) break;
  }
  return result;
}

function safeWarnings(values) {
  return uniqueByKey(
    (Array.isArray(values) ? values : [])
      .map((value) =>
        String(value || "")
          .trim()
          .toLowerCase(),
      )
      .filter((value) => /^[a-z0-9_]{2,100}$/.test(value)),
    (value) => value,
    20,
  );
}

function phoneNumbersFromText(value) {
  const text = String(value || "");
  const matches = text.match(/(?:\+?84|0)\s*(?:\d[\s.\-]?){8,10}\d/g) || [];
  return uniqueByKey(
    matches
      .map((match) => match.replace(/\s+/g, " ").trim())
      .filter((match) => match.replace(/\D/g, "").length >= 9),
    (value) => value.replace(/\D/g, "").replace(/^84/, "0"),
    6,
  );
}

function stopAtNonAddressText(value) {
  return String(value || "")
    .replace(
      /(?:^|[\s,;|/\\-])(?:ĐT|DT|SĐT|SDT|PHONE|HOTLINE)\s*[:.-]?.*$/iu,
      " ",
    )
    .replace(
      /\b(?:bán\s+từ|ban\s+tu|mở\s+cửa|mo\s+cua|giờ\s+mở|gio\s+mo)\b.*$/iu,
      " ",
    )
    .replace(/\b\d{1,2}\s*h\s*(?:đến|den|tới|toi|-|–)\s*\d{1,2}\s*h?.*$/iu, " ")
    .replace(/\b(?:subscribe|like|share|follow|comment)\b.*$/iu, " ");
}

function cleanAddressCandidate(value) {
  let text = String(value || "")
    .replace(/Ỹ/g, " ")
    .replace(/\bS[ổo]\s*(\d{1,5})\b/giu, "Số $1")
    .replace(/\bSố\s*(\d{1,5})\b/giu, "Số $1")
    .replace(
      /\b(P\.?\s*\d{1,2}|Phường\s*\d{1,2})\s+[0O]\.\s*(\d{1,2})\b/giu,
      "$1 Q.$2",
    )
    .replace(
      /\b(P\.?\s*\d{1,2}|Phường\s*\d{1,2})\s+[0O]\s+(\d{1,2})\b/giu,
      "$1 Q.$2",
    )
    .replace(
      /\b(P\.?\s*[^,|\n]{2,60})\s+0?(\d{1,2})\s+(?=B[aảá]n\s+t)/giu,
      "$1 Q.$2 ",
    )
    .replace(/\bP\.?\s*Thạnh\s*m[yỹ]\s*l[aạ]i\b/giu, "P. Thạnh Mỹ Lợi")
    .replace(/\bHai\s+Bài\s+Trưng\b/giu, "Hai Bà Trưng")
    .replace(
      /\b(Dia\s*chi|Địa\s*chỉ)\s+(\d{1,3})\s+(?:Đường|Duong)\s+s[ốo]\s*S\b/giu,
      "$2 Đường số 9",
    )
    .replace(/\b(?:ĐC|DC|Địa\s*chỉ|Dia\s*chi|Address)\s*[:.-]?\s*/giu, "");

  text = stopAtNonAddressText(text)
    .replace(/\b(?:hơn|hon)\s+\d+\s+(?:món|mon)\b.*$/iu, " ")
    .replace(/\b(?:quán|quan)\s+ăn\s+vặt\b.*$/iu, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/\bP\.\s*/giu, "P.")
    .replace(/\bQ\.\s*/giu, "Q.")
    .trim();

  // Prefer the clearest address span when OCR includes extra leading/trailing text.
  const patterns = [
    /\b(?:Số\s*)?\d{1,5}\s+[A-Za-zÀ-ỹ0-9 .'-]{2,70}?\s*,?\s*(?:P\.?|Phường)\s*[A-Za-zÀ-ỹ0-9 .'-]{1,45}?\s*,?\s*(?:Q\.?|Quận)\s*\d{1,2}\b/giu,
    /\b(?:Số\s*)?\d{1,5}\s+[A-Za-zÀ-ỹ0-9 .'-]{2,70}?\s*,?\s*(?:Q\.?|Quận)\s*\d{1,2}\b/giu,
    /\b(?:Số\s*)?\d{1,5}\/[A-Za-z0-9]{1,8}\s+[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ'.-]*(?:\s+[A-Za-zÀ-ỹ][A-Za-zÀ-ỹ'.-]*){1,7}\b/giu,
    /\b(?:Số\s*)?\d{1,5}\s+(?:Đường|Duong|D\.?)\s*\d{1,5}\s+[A-Za-zÀ-ỹ0-9 .'-]{2,80}\b/giu,
  ];
  const spans = patterns
    .flatMap((pattern) =>
      [...text.matchAll(pattern)].map((match) => match[0].trim()),
    )
    .filter(Boolean);
  if (spans.length) {
    text = spans.sort((left, right) => {
      const leftScore = addressQualityScore(left);
      const rightScore = addressQualityScore(right);
      return rightScore - leftScore || left.length - right.length;
    })[0];
  }

  return text.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
}

function addressQualityScore(value) {
  const raw = String(value || "");
  const text = normalizeVietnamese(raw);
  if (!text) return 0;
  let score = 0;
  if (/^(?:so\s*)?\d{1,5}(?:\/[a-z0-9]{1,8})?\b/.test(text)) score += 2;
  if (/(?:^|\s)(?:p\.|phuong)\s*[a-z0-9]/i.test(raw)) score += 1;
  if (/(?:^|\s)(?:q\.|quận|quan)\s*\d{1,2}/i.test(raw)) score += 2;
  if (/\b(?:đường|duong|d\.|hẻm|hem|ngõ|ngo)\b/i.test(raw)) score += 1;
  if (
    /\b(?:dương|đình|nghệ|nguyen|nguyễn|tran|trần|le|lê|pham|phạm|vo|võ|pasteur|tôn|thất|hiệp|hai|bà|trưng|vạn|kiếp)\b/i.test(
      raw,
    )
  )
    score += 1;
  if (/\d{1,5}\/[a-z0-9]{1,8}/i.test(raw)) score += 1;
  if (
    /\b(?:món|mon|menu|tuần|tuan|giá|gia|k|ship|review|checkin)\b/i.test(text)
  )
    score -= 3;
  if (/\b(?:st|street|road|rd)\b/i.test(text) && !/[À-ỹĐđ]/.test(raw))
    score -= 3;
  return score;
}

function isStrictAddress(value, { fromPrefix = false } = {}) {
  const raw = String(value || "").trim();
  const text = normalizeVietnamese(raw);
  if (!text) return false;
  if (raw.length < 8) return false;
  if (
    /\b(?:món|mon|menu|combo|review|checkin|ngon|rẻ|re|siêu|sieu|đa dạng|da dang)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  // Reject OCR garbage such as "7 4, St, ra P3".
  if (/\b(?:st|street|road|rd)\b/i.test(text) && !/[À-ỹĐđ]/.test(raw))
    return false;
  if (/\bp\d{1,2}\b/i.test(text) && !/\bP\.\s*\d{1,2}\b/i.test(raw))
    return false;

  const startsWithHouse = /^(?:so\s*)?\d{1,5}(?:\/[a-z0-9]{1,8})?\b/.test(text);
  if (!startsWithHouse) return false;

  const hasSlashAddress =
    /^\d{1,5}\/[a-z0-9]{1,8}\s+[a-z0-9.-]{2,}(?:\s+[a-z0-9.-]{2,}){1,7}\b/.test(
      text,
    );
  const hasDistrict = /(?:^|\s)(?:q\.|quan|quận)\s*\d{1,2}\b/i.test(raw);
  const hasWard = /(?:^|\s)(?:p\.|phường|phuong)\s*[A-Za-zÀ-ỹ0-9]/i.test(raw);
  const hasStreetKeyword = /\b(?:đường|duong|d\.|hẻm|hem|ngõ|ngo)\b/i.test(raw);
  const hasStreetNameWords =
    /^(?:so\s*)?\d{1,5}\s+[a-z0-9.-]{2,}(?:\s+[a-z0-9.-]{2,}){1,8}\b/.test(
      text,
    );

  return Boolean(
    hasSlashAddress ||
    (hasStreetKeyword && (hasDistrict || hasWard || fromPrefix)) ||
    (hasStreetNameWords && (hasDistrict || hasWard)) ||
    (fromPrefix && hasStreetNameWords && addressQualityScore(raw) >= 3),
  );
}

function addressCandidatesFromLine(
  lineText,
  confidence = 0.72,
  source = "unknown",
  timestampSeconds = null,
) {
  const raw = capText(lineText, 500);
  if (!raw) return [];
  const candidates = [];

  const prefixPattern =
    /(?:ĐC|DC|Địa\s*chỉ|Dia\s*chi|Address)\s*[:.-]?\s*([^\n|]{4,180})/giu;
  for (const match of raw.matchAll(prefixPattern)) {
    const value = cleanAddressCandidate(match[1]);
    if (isStrictAddress(value, { fromPrefix: true })) {
      candidates.push({
        value,
        confidence: Math.max(0.86, confidence),
        source,
        timestampSeconds,
        rawText: raw,
      });
    }
  }

  const whole = cleanAddressCandidate(raw);
  if (isStrictAddress(whole)) {
    candidates.push({
      value: whole,
      confidence,
      source,
      timestampSeconds,
      rawText: raw,
    });
  }

  return uniqueByKey(candidates, (item) => normalizeVietnamese(item.value), 4);
}

function extractBestAddress(evidenceItems) {
  const candidates = [];
  for (const item of evidenceItems) {
    candidates.push(
      ...addressCandidatesFromLine(
        item.text,
        roundConfidence(item.confidence, 0.72),
        item.source,
        item.timestampSeconds,
      ),
    );
  }
  const unique = uniqueByKey(
    candidates
      .map((candidate) => ({
        ...candidate,
        confidence: roundConfidence(
          candidate.confidence +
            Math.min(0.08, addressQualityScore(candidate.value) * 0.01),
          candidate.confidence,
        ),
      }))
      .sort(
        (left, right) =>
          right.confidence - left.confidence ||
          addressQualityScore(right.value) - addressQualityScore(left.value),
      ),
    (item) => normalizeVietnamese(item.value),
    8,
  );
  return {
    best: unique[0] || null,
    candidates: unique,
  };
}

function extractOcrLines(
  ocrEvidence,
  { source = "frame_ocr", timestampSeconds = null } = {},
) {
  const lines = [];
  const add = (text, confidence = ocrEvidence?.confidence) => {
    const capped = capText(text, 500);
    if (!capped) return;
    lines.push({
      text: capped,
      confidence: roundConfidence(confidence, 0.72),
      source,
      timestampSeconds,
    });
  };

  for (const line of Array.isArray(ocrEvidence?.strongLines)
    ? ocrEvidence.strongLines
    : []) {
    add(line?.evidenceText || line?.text, line?.confidence);
  }
  for (const line of Array.isArray(ocrEvidence?.lines)
    ? ocrEvidence.lines
    : []) {
    add(line?.evidenceText || line?.text, line?.confidence);
  }
  if (ocrEvidence?.text) {
    for (const text of String(ocrEvidence.text).split(/\r?\n/))
      add(text, ocrEvidence.confidence);
  }
  if (ocrEvidence?.rawText && ocrEvidence.rawText !== ocrEvidence?.text) {
    for (const text of String(ocrEvidence.rawText).split(/\r?\n/))
      add(text, ocrEvidence.confidence);
  }

  return uniqueByKey(
    lines,
    (item) =>
      `${item.source}:${item.timestampSeconds}:${normalizeVietnamese(item.text)}`,
    24,
  );
}

function runCommand(
  command,
  args,
  { timeoutMs = 20_000, cwd = process.cwd() } = {},
) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd,
        windowsHide: true,
        timeout: Math.max(500, Number(timeoutMs) || 20_000),
        maxBuffer: 8 * 1024 * 1024,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
      },
    );
  });
}

function stripVtt(value) {
  return String(value || "")
    .replace(/^WEBVTT.*$/gim, " ")
    .replace(/^Kind:.*$/gim, " ")
    .replace(/^Language:.*$/gim, " ")
    .replace(
      /\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}.*$/gm,
      " ",
    )
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractYoutubeCaptionText(url, { timeoutMs = 20_000 } = {}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "vauto-captions-"));
  try {
    await runCommand(
      "yt-dlp",
      [
        "--skip-download",
        "--no-playlist",
        "--write-auto-subs",
        "--write-subs",
        "--sub-langs",
        "vi,en",
        "--sub-format",
        "vtt",
        "-o",
        path.join(tempDir, "%(id)s.%(ext)s"),
        url,
      ],
      { timeoutMs },
    );
    const files = await readdir(tempDir);
    const vttFiles = files.filter((file) =>
      file.toLowerCase().endsWith(".vtt"),
    );
    const texts = [];
    for (const file of vttFiles.slice(0, 4)) {
      const text = stripVtt(await readFile(path.join(tempDir, file), "utf8"));
      if (text) texts.push(text);
    }
    return {
      status: texts.length ? "usable" : "empty",
      texts: uniqueByKey(texts, (value) => normalizeVietnamese(value), 4),
      warnings: texts.length ? [] : ["youtube_caption_empty"],
    };
  } catch {
    return {
      status: "failed",
      texts: [],
      warnings: ["youtube_caption_unavailable"],
    };
  } finally {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore temp cleanup failures in this simple helper.
    }
  }
}

function valuesFromTextSources(textSources = []) {
  return (Array.isArray(textSources) ? textSources : [])
    .map((source) => ({
      text: capText(source?.text, 500),
      confidence: roundConfidence(source?.confidence, 0.5),
      source: source?.type || source?.source || "metadata",
    }))
    .filter((item) => item.text);
}

async function collectMetadata(url) {
  try {
    const result = await resolveYouTubeUrl({ url, platform: "youtube" });
    return {
      status: "usable",
      textSources: Array.isArray(result?.textSources) ? result.textSources : [],
      warnings: safeWarnings(result?.warnings || []),
      debug: result?.debug || {},
    };
  } catch (error) {
    return {
      status: "failed",
      textSources: [],
      warnings: ["youtube_metadata_failed"],
      debug: { error: String(error?.message || error).slice(0, 120) },
    };
  }
}

function queryPieces({ address, metadataTexts, transcriptTexts, ocrTexts }) {
  const pieces = [];
  if (address) pieces.push(address);
  for (const item of [...ocrTexts, ...transcriptTexts, ...metadataTexts]) {
    const text = capText(typeof item === "string" ? item : item?.text, 180);
    if (!text) continue;
    pieces.push(text);
  }
  return uniqueByKey(pieces, (value) => normalizeVietnamese(value), 8);
}

function buildSearchQueries({
  address,
  metadataTexts = [],
  transcriptTexts = [],
  ocrTexts = [],
}) {
  const pieces = queryPieces({
    address,
    metadataTexts,
    transcriptTexts,
    ocrTexts,
  });
  const queries = [];
  if (address) queries.push(`${address} quán ăn`);
  const allText = pieces.join(" ");
  const district = (allText.match(/(?:Q\.?|Quận)\s*\d{1,2}/i) || [])[0];
  const foodHint = allText.match(
    /(?:quán\s+ăn\s+vặt|ăn\s+vặt|cơm\s+tấm|bún|phở|hủ\s+tiếu|bánh|trà\s+sữa|cafe|cà\s+phê)/i,
  )?.[0];
  if (foodHint && district) queries.push(`${foodHint} ${district} Sài Gòn`);
  if (pieces.length) queries.push(pieces.join(" ").slice(0, MAX_QUERY_TEXT));
  return uniqueByKey(queries, (value) => normalizeVietnamese(value), 4);
}

function configuredLocationProvider(env = process.env) {
  return String(
    env.LOCATION_RESOLUTION_PROVIDER ||
      env.FOOD_MAP_LOCATION_PROVIDER ||
      "disabled",
  )
    .trim()
    .toLowerCase();
}

function googleCandidate(place) {
  return {
    name: place?.displayName?.text || place?.name || null,
    address: place?.formattedAddress || null,
    phone:
      place?.nationalPhoneNumber || place?.internationalPhoneNumber || null,
    placeId: place?.id || null,
    lat: Number.isFinite(Number(place?.location?.latitude))
      ? Number(place.location.latitude)
      : null,
    lng: Number.isFinite(Number(place?.location?.longitude))
      ? Number(place.location.longitude)
      : null,
    rating: Number.isFinite(Number(place?.rating))
      ? Number(place.rating)
      : null,
    userRatingsTotal: Number.isFinite(Number(place?.userRatingCount))
      ? Number(place.userRatingCount)
      : null,
    source: "google_places",
  };
}

async function searchGooglePlaces(
  query,
  {
    apiKey,
    timeoutMs = 8_000,
    maxCandidates = 5,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  if (!String(apiKey || "").trim()) {
    return {
      status: "missing_api_key",
      candidates: [],
      warnings: ["google_places_api_key_missing"],
    };
  }
  if (typeof fetchImpl !== "function") {
    return {
      status: "unavailable",
      candidates: [],
      warnings: ["fetch_unavailable"],
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
  try {
    const response = await fetchImpl(GOOGLE_TEXT_SEARCH_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.location",
          "places.rating",
          "places.userRatingCount",
          "places.nationalPhoneNumber",
          "places.internationalPhoneNumber",
        ].join(","),
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: Math.max(1, Math.min(10, Number(maxCandidates) || 5)),
      }),
    });
    if (!response.ok) {
      return {
        status: "provider_error",
        candidates: [],
        warnings: ["google_places_failed"],
      };
    }
    const payload = await response.json();
    const candidates = (Array.isArray(payload?.places) ? payload.places : [])
      .map(googleCandidate)
      .filter((candidate) => candidate.name || candidate.address);
    return {
      status: candidates.length ? "usable" : "not_found",
      candidates,
      warnings: [],
    };
  } catch (error) {
    return {
      status: error?.name === "AbortError" ? "timeout" : "provider_error",
      candidates: [],
      warnings: [
        error?.name === "AbortError"
          ? "google_places_timeout"
          : "google_places_failed",
      ],
    };
  } finally {
    clearTimeout(timer);
  }
}

async function resolveMapCandidates(searchQueries, { env = process.env } = {}) {
  const provider = configuredLocationProvider(env);
  if (provider !== "google") {
    return {
      status: "provider_disabled",
      queryUsed: null,
      candidates: [],
      warnings: [],
    };
  }
  const apiKey = env.GOOGLE_MAPS_API_KEY || env.GOOGLE_PLACES_API_KEY || "";
  const warnings = [];
  for (const query of searchQueries.slice(0, 3)) {
    const result = await searchGooglePlaces(query, {
      apiKey,
      timeoutMs: Number(env.LOCATION_RESOLUTION_TIMEOUT_MS || 8_000),
      maxCandidates: Number(env.LOCATION_RESOLUTION_MAX_CANDIDATES || 5),
    });
    warnings.push(...(result.warnings || []));
    if (result.candidates?.length) {
      return {
        status:
          result.candidates.length === 1
            ? "matched_place"
            : "multiple_candidates",
        queryUsed: query,
        candidates: result.candidates,
        warnings: safeWarnings(warnings),
      };
    }
    if (result.status === "missing_api_key") {
      return {
        status: "missing_api_key",
        queryUsed: query,
        candidates: [],
        warnings: safeWarnings(warnings),
      };
    }
  }
  return {
    status: "not_found",
    queryUsed: searchQueries[0] || null,
    candidates: [],
    warnings: safeWarnings(warnings),
  };
}

export async function analyzeYoutubeFoodMapSimple(
  { url } = {},
  {
    env = process.env,
    extractFrames = extractYouTubeFrames,
    extractOcr = extractOcrEvidenceWithProvider,
    metadataProvider = collectMetadata,
    captionProvider = extractYoutubeCaptionText,
    mapResolver = resolveMapCandidates,
  } = {},
) {
  const warnings = [];
  const steps = [];
  const startedAt = Date.now();

  if (!/^https?:\/\//i.test(String(url || ""))) {
    return {
      status: "invalid_input",
      confidence: 0,
      reason: "missing_or_invalid_url",
      address: null,
      mapCandidates: [],
      warnings: ["invalid_url"],
      steps: ["simple_input_invalid"],
    };
  }

  steps.push("simple_input_resolved");

  const metadata = await metadataProvider(url);
  warnings.push(...(metadata.warnings || []));
  const metadataEvidence = valuesFromTextSources(metadata.textSources).map(
    (item) => ({
      ...item,
      source: `metadata:${item.source}`,
    }),
  );
  steps.push("simple_metadata_collected");

  const frameResult = await extractFrames({
    url,
    maxFrames: Number(
      env.SIMPLE_VAUTO_MAX_FRAMES || env.YOUTUBE_FRAME_SCAN_MAX_FRAMES || 4,
    ),
    maxDurationSeconds: Number(
      env.SIMPLE_VAUTO_MAX_DURATION_SECONDS ||
        env.YOUTUBE_FRAME_SCAN_MAX_DURATION_SECONDS ||
        60,
    ),
    timeoutMs: Number(
      env.SIMPLE_VAUTO_FRAME_TIMEOUT_MS ||
        env.YOUTUBE_FRAME_SCAN_TIMEOUT_MS ||
        30_000,
    ),
    mode:
      env.SIMPLE_VAUTO_FRAME_SCAN_MODE ||
      env.YOUTUBE_FRAME_SCAN_MODE ||
      "dense_1fps",
    tempDir: env.YOUTUBE_FRAME_SCAN_TEMP_DIR || "",
  });
  warnings.push(...(frameResult?.warnings || []));
  const frames = (Array.isArray(frameResult?.frames) ? frameResult.frames : [])
    .filter((frame) => Buffer.isBuffer(frame?.buffer) && frame.buffer.length)
    .slice(
      0,
      Math.max(
        1,
        Math.min(
          8,
          Number(
            env.SIMPLE_VAUTO_MAX_FRAMES ||
              env.YOUTUBE_FRAME_SCAN_MAX_FRAMES ||
              4,
          ),
        ),
      ),
    );
  steps.push("simple_frames_extracted");

  const frameEvidence = [];
  for (const frame of frames) {
    try {
      const ocrEvidence = await extractOcr(
        {
          image: {
            buffer: frame.buffer,
            mimetype: frame.mimetype || "image/jpeg",
            originalname: "simple-vauto-youtube-frame.jpg",
            timestampSeconds: frame.timestampSeconds,
            sourceCrop: "full",
          },
        },
        {
          provider: "google_vision",
          fallbackToTesseract: false,
        },
      );
      warnings.push(...(ocrEvidence?.warnings || []));
      frameEvidence.push(
        ...extractOcrLines(ocrEvidence, {
          source: "frame_ocr",
          timestampSeconds: frame.timestampSeconds,
        }),
      );
    } catch (error) {
      warnings.push(
        error?.name === "AbortError" ? "frame_ocr_timeout" : "frame_ocr_failed",
      );
    }
  }
  steps.push("simple_frame_ocr_completed");

  const captions =
    String(env.SIMPLE_VAUTO_CAPTIONS_ENABLED || "true").toLowerCase() ===
    "false"
      ? { status: "disabled", texts: [], warnings: [] }
      : await captionProvider(url, {
          timeoutMs: Number(env.SIMPLE_VAUTO_CAPTION_TIMEOUT_MS || 20_000),
        });
  warnings.push(...(captions.warnings || []));
  const transcriptEvidence = (captions.texts || []).map((text) => ({
    text: capText(text, 700),
    confidence: 0.62,
    source: "caption_transcript",
    timestampSeconds: null,
  }));
  steps.push("simple_caption_checked");

  const allEvidence = [
    ...frameEvidence,
    ...transcriptEvidence,
    ...metadataEvidence,
  ];
  const phones = uniqueByKey(
    allEvidence.flatMap((item) => phoneNumbersFromText(item.text)),
    (value) => value.replace(/\D/g, "").replace(/^84/, "0"),
    8,
  );
  const { best: bestAddress, candidates: addressCandidates } =
    extractBestAddress([...frameEvidence, ...transcriptEvidence]);
  steps.push("simple_entities_extracted");

  const searchQueries = buildSearchQueries({
    address: bestAddress?.value || null,
    metadataTexts: metadataEvidence,
    transcriptTexts: transcriptEvidence,
    ocrTexts: frameEvidence,
  });
  const mapResult = await mapResolver(searchQueries, { env });
  warnings.push(...(mapResult.warnings || []));
  steps.push("simple_map_resolution_completed");

  let status = "unresolved_best_effort";
  let reason = "no_clear_address_or_map_candidate";
  let confidence = 0;
  let draft = null;

  if (mapResult.status === "matched_place") {
    status = "matched_place";
    reason = "google_places_single_candidate";
    confidence = bestAddress ? Math.max(0.86, bestAddress.confidence) : 0.72;
  } else if (mapResult.status === "multiple_candidates") {
    status = "multiple_candidates";
    reason = "google_places_multiple_candidates";
    confidence = bestAddress ? Math.max(0.78, bestAddress.confidence) : 0.62;
  } else if (bestAddress) {
    status = "draft_candidate";
    reason = "clear_address_from_frame_or_transcript";
    confidence = Math.max(0.82, bestAddress.confidence);
    draft = {
      name: null,
      address: bestAddress.value,
      phone: phones[0] || null,
      sourceUrl: url,
      confidence,
      reviewRequired: true,
      evidence: [
        {
          source: bestAddress.source,
          text: bestAddress.rawText,
          timestampSeconds: bestAddress.timestampSeconds,
        },
      ],
    };
  } else if (mapResult.candidates?.length) {
    status = "multiple_candidates";
    reason = "map_candidates_from_metadata_or_transcript";
    confidence = 0.55;
  }

  return {
    status,
    confidence: roundConfidence(confidence),
    reason,
    address: bestAddress
      ? {
          value: bestAddress.value,
          confidence: roundConfidence(bestAddress.confidence),
          source: bestAddress.source,
          evidence: [bestAddress.rawText].filter(Boolean),
          timestampSeconds: bestAddress.timestampSeconds,
        }
      : null,
    phones,
    draft,
    map: {
      status: mapResult.status,
      queryUsed: mapResult.queryUsed,
      candidates: mapResult.candidates || [],
    },
    searchQueries,
    evidence: {
      frameTexts: frameEvidence.map((item) => ({
        timestampSeconds: item.timestampSeconds,
        text: item.text,
        confidence: item.confidence,
      })),
      transcriptTexts: transcriptEvidence.map((item) => item.text),
      metadataTexts: metadataEvidence.map((item) => item.text),
      addressCandidates,
      captionStatus: captions.status,
      frameStatus: frames.length ? "usable" : frameResult?.status || "empty",
      frameTimestamps: frames.map((frame) => frame.timestampSeconds),
      frameDurationSeconds: frameResult?.durationSeconds || null,
    },
    warnings: safeWarnings(warnings),
    steps,
    debug: {
      durationMs: Date.now() - startedAt,
      frameCount: frames.length,
      videoId: frameResult?.videoId || metadata.debug?.videoId || null,
      metadataStatus: metadata.status,
      captionStatus: captions.status,
    },
  };
}
function cleanSimpleAddress(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/\((?:\d{1,2}h|\d{1,2}:\d{2}|[^)]{0,40})\)/gi, " ")
    .replace(
      /\b(?:10h30|10h|14h|18|20h|40-50k|contact|fanpage|instagram|facebook|email)\b.*$/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function extractLabeledAddressCandidates(text, source = "unknown") {
  const raw = String(text || "");
  const candidates = [];

  const labeledPatterns = [
    /(?:Địa\s*chỉ|Dia\s*chi|Address|ĐC|DC)\s*[:.-]?\s*([^|▶\n\r]+?)(?=(?:\(|\||▶|Fanpage|Instagram|Instargram|Contact|Email|$))/giu,
  ];

  for (const pattern of labeledPatterns) {
    for (const match of raw.matchAll(pattern)) {
      const address = cleanSimpleAddress(match[1]);
      if (isSimpleVietnamAddress(address)) {
        candidates.push({
          address,
          source,
          confidence: source === "metadata" ? 0.86 : 0.9,
          evidenceText: match[0],
        });
      }
    }
  }

  return candidates;
}

function isSimpleVietnamAddress(value = "") {
  const text = String(value || "").trim();
  if (!text || isWeakVietnamAddressText(text)) return false;

  const looksLikeGarbage =
    /[0-9]\.[0-9]/.test(text) || /\bp\s*\d{2,}\b/i.test(text);

  return (
    hasVietnamHouseNumber(text) &&
    hasVietnamStreetName(text) &&
    hasVietnamAdminOrArea(text) &&
    !looksLikeGarbage
  );
}

export const __simpleYoutubeFoodMapTestUtils = {
  cleanAddressCandidate,
  isStrictAddress,
  addressCandidatesFromLine,
  extractBestAddress,
  buildSearchQueries,
};
