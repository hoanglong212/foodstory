import {
  STREET_TOKENS,
  matchingVietnamStreetTokens,
  normalizeVietnameseAddressText,
  vietnamHouseNumbers,
} from "./vietnamAddressLexicon.js";

const STATUSES = new Set([
  "matched_place",
  "draft_candidate",
  "multi_candidate",
  "unresolved_best_effort",
]);

const GENERIC_STREET_TOKENS = new Set([
  "duong",
  "street",
  "road",
  "hem",
  "ngo",
  "le",
  "tran",
  "nguyen",
  "pham",
  "vo",
  "hoang",
  "dinh",
  "phu",
]);

const STREET_DISPLAY_NAMES = new Map([["le quy don", "Lê Quý Đôn"]]);

const GEMINI_CANDIDATE_EXTRACTION_STATUSES = new Set([
  "disabled",
  "skipped_gate",
  "missing_api_key",
  "missing_model",
  "requested",
  "success",
  "timeout",
  "invalid_json",
  "provider_error",
  "no_accepted_candidates",
]);

function roundScore(value) {
  return Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 1000) / 1000;
}

function capText(value, maximumLength = 300) {
  const text = String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maximumLength);
}

function safeUrl(value) {
  const text = capText(value, 2_000);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    for (const key of [...parsed.searchParams.keys()]) {
      if (
        /(?:api[_-]?key|token|secret|signature|credential|authorization)/i.test(
          key,
        )
      ) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.href.slice(0, 2_000);
  } catch {
    return null;
  }
}

function safeSource(value) {
  const text = capText(value, 160);
  if (!/^https?:\/\//i.test(text)) return text;
  const sanitized = safeUrl(text);
  if (!sanitized) return "public_url";
  try {
    const parsed = new URL(sanitized);
    return `${parsed.origin}${parsed.pathname}`.slice(0, 160);
  } catch {
    return "public_url";
  }
}

function warningCodes(values) {
  return uniqueText(values, 16, 100).map((value) =>
    /^[a-z0-9_]{2,100}$/.test(value) ? value : "vision_auto_warning",
  );
}

function uniqueText(values, maximumItems, maximumLength) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = capText(value, maximumLength);
    const key = text.toLocaleLowerCase("vi");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maximumItems) break;
  }
  return result;
}

function publicNamedEntity(entity = null) {
  return {
    value: entity?.value ? capText(entity.value, 260) : null,
    confidence: roundScore(entity?.confidence),
    source: entity?.source ? capText(entity.source, 40) : null,
    evidence: uniqueText(
      Array.isArray(entity?.evidence)
        ? entity.evidence
        : entity?.evidence
          ? [entity.evidence]
          : [],
      4,
      220,
    ),
    ...(entity?.reviewRequired === true ? { reviewRequired: true } : {}),
  };
}

function publicArrayEntities(items = [], { includeType = false } = {}) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (!item?.value) return null;
      return {
        value: capText(item.value, 120),
        confidence: roundScore(item.confidence),
        source: item.source ? capText(item.source, 40) : null,
        evidence: uniqueText(
          Array.isArray(item.evidence)
            ? item.evidence
            : item.evidence
              ? [item.evidence]
              : [],
          3,
          220,
        ),
        ...(includeType && item.type ? { type: capText(item.type, 30) } : {}),
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function publicMetadata(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      type: capText(item?.type, 40),
      text: capText(item?.text, 500),
      confidence: roundScore(item?.confidence),
      source: safeSource(item?.source || "unknown"),
    }))
    .filter((item) => item.type && item.text)
    .slice(0, 20);
}

function publicFrameEvidence(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const text = capText(item?.text, 220);
      if (!text) return null;
      const timestamps = (
        Array.isArray(item?.timestamps)
          ? item.timestamps
          : [item?.timestampSeconds]
      )
        .map(Number)
        .filter(Number.isFinite)
        .map((value) => Math.round(value * 1000) / 1000)
        .slice(0, 8);
      return {
        source: "youtube_frame_ocr",
        timestampSeconds: timestamps[0] ?? null,
        timestamps,
        textLines: [
          {
            text,
            confidence: roundScore(item?.confidence),
            type: capText(item?.type || "other", 30),
          },
        ],
        confidence: roundScore(item?.confidence),
        selectedLineType: capText(item?.type || "other", 30),
        supportCount: Math.max(
          1,
          Math.min(8, Math.round(Number(item?.supportCount) || 1)),
        ),
        warningCodes: warningCodes(item?.warnings || []).slice(0, 4),
      };
    })
    .filter(Boolean)
    .slice(0, 16);
}

function publicCandidate(candidate = null) {
  if (!candidate || typeof candidate !== "object") return null;
  return {
    name: candidate.name ? capText(candidate.name, 180) : null,
    formattedAddress: candidate.formattedAddress
      ? capText(candidate.formattedAddress, 300)
      : null,
    phone: candidate.phone ? capText(candidate.phone, 40) : null,
    lat: Number.isFinite(Number(candidate.lat)) ? Number(candidate.lat) : null,
    lng: Number.isFinite(Number(candidate.lng)) ? Number(candidate.lng) : null,
    placeId: candidate.placeId ? capText(candidate.placeId, 255) : null,
    source: candidate.source ? capText(candidate.source, 40) : null,
    confidence: roundScore(candidate.confidence),
    matchReasons: uniqueText(candidate.matchReasons, 8, 80),
  };
}

function publicDraft(draft = null) {
  if (!draft || typeof draft !== "object") return null;
  return {
    name: draft.name ? capText(draft.name, 180) : null,
    address: draft.address ? capText(draft.address, 300) : null,
    phone: draft.phone ? capText(draft.phone, 40) : null,
    dishNames: uniqueText(draft.dishNames, 8, 100),
    locationHints: uniqueText(draft.locationHints, 8, 100),
    sourceUrl: safeUrl(draft.sourceUrl),
    confidence: roundScore(draft.confidence),
    reviewRequired: true,
  };
}

function normalizedTokensWithOffsets(value) {
  const text = String(value || "");
  return [...text.matchAll(/[0-9A-Za-zÀ-ỹĐđ]+/gu)]
    .map((match) => ({
      raw: match[0],
      normalized: normalizeVietnameseAddressText(match[0]),
      start: Number(match.index || 0),
      end: Number(match.index || 0) + match[0].length,
    }))
    .filter((token) => token.normalized);
}

function hasLeadingAddressAnchor(value) {
  const text = normalizeVietnameseAddressText(value);
  return (
    /^(?:so\s*)?\d{1,5}[a-z]?(?:\s+\d{1,5}[a-z]?)?\b/.test(text) ||
    /^(?:lo|block|chung cu|cu xa)\b/.test(text)
  );
}

function stripLeadingTokenPrefix(value, prefix) {
  const text = String(value || "").trim();
  const prefixTokens = normalizeVietnameseAddressText(prefix)
    .split(" ")
    .filter(Boolean);
  if (!text || !prefixTokens.length) return text;

  const tokens = normalizedTokensWithOffsets(text);
  if (tokens.length < prefixTokens.length) return text;
  const matches = prefixTokens.every(
    (token, index) => tokens[index]?.normalized === token,
  );
  if (!matches) return text;

  let cutIndex = tokens[prefixTokens.length - 1].end;
  const nextToken = tokens[prefixTokens.length];
  if (nextToken && /^\d{1,4}k$/i.test(nextToken.raw)) {
    cutIndex = nextToken.end;
  }

  const stripped = text
    .slice(cutIndex)
    .replace(/^[\s,;:|/\\-]+/u, "")
    .trim();
  return hasLeadingAddressAnchor(stripped) ? stripped : text;
}

function stripKnownAddressPrefixes(address, item = {}) {
  let text = String(address || "").trim();
  const prefixes = [item?.placeName, item?.dishHint]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .sort(
      (left, right) =>
        normalizeVietnameseAddressText(right).split(" ").length -
        normalizeVietnameseAddressText(left).split(" ").length,
    );

  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const prefix of prefixes) {
      const next = stripLeadingTokenPrefix(text, prefix);
      if (next !== text) {
        text = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return text;
}

function editDistanceAtMostOne(left, right) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) {
      leftIndex += 1;
    } else if (right.length > left.length) {
      rightIndex += 1;
    } else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return (
    edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1
  );
}

function displayStreetName(token) {
  if (STREET_DISPLAY_NAMES.has(token)) return STREET_DISPLAY_NAMES.get(token);
  return token
    .split(" ")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function hasFullAddressContext(value) {
  const text = normalizeVietnameseAddressText(value);
  return (
    /\b\d{1,5}\b/.test(text) &&
    /\b(?:p|phuong|q|quan|district|ward)\s*[a-z0-9]+\b/.test(text)
  );
}

function repairNearStreetName(address) {
  if (!hasFullAddressContext(address)) return address;
  const exactStreetTokens = matchingVietnamStreetTokens(address).filter(
    (token) => token.split(" ").length >= 2,
  );
  if (exactStreetTokens.length) return address;

  const tokens = normalizedTokensWithOffsets(address);
  for (const streetToken of STREET_TOKENS) {
    const streetWords = streetToken.split(" ").filter(Boolean);
    if (
      streetWords.length < 2 ||
      streetWords.every((word) => GENERIC_STREET_TOKENS.has(word))
    ) {
      continue;
    }

    for (
      let index = 0;
      index <= tokens.length - streetWords.length;
      index += 1
    ) {
      let changedWords = 0;
      let exactWords = 0;
      let repairable = true;
      for (let offset = 0; offset < streetWords.length; offset += 1) {
        const actual = tokens[index + offset]?.normalized || "";
        const expected = streetWords[offset];
        if (actual === expected) {
          exactWords += 1;
          continue;
        }
        if (
          actual.length < 3 ||
          expected.length < 3 ||
          !editDistanceAtMostOne(actual, expected)
        ) {
          repairable = false;
          break;
        }
        changedWords += 1;
      }
      if (
        !repairable ||
        changedWords !== 1 ||
        exactWords < streetWords.length - 1
      ) {
        continue;
      }

      const start = tokens[index].start;
      const end = tokens[index + streetWords.length - 1].end;
      return `${address.slice(0, start)}${displayStreetName(streetToken)}${address.slice(end)}`
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  return address;
}

function punctuateCuXaStreetAddress(address) {
  const tokens = normalizedTokensWithOffsets(address);
  const cuXaIndex = tokens.findIndex(
    (token, index) =>
      token.normalized === "cu" && tokens[index + 1]?.normalized === "xa",
  );
  if (cuXaIndex < 0) return address;

  for (const streetToken of STREET_TOKENS) {
    const streetWords = streetToken.split(" ").filter(Boolean);
    if (streetWords.length < 2) continue;
    for (
      let index = cuXaIndex + 4;
      index <= tokens.length - streetWords.length;
      index += 1
    ) {
      const matches = streetWords.every(
        (word, offset) => tokens[index + offset]?.normalized === word,
      );
      if (!matches) continue;

      const insertAt = tokens[index].start;
      if (address.slice(Math.max(0, insertAt - 3), insertAt).includes(",")) {
        return address;
      }
      return `${address.slice(0, insertAt).trimEnd()}, ${address
        .slice(insertAt)
        .trimStart()}`;
    }
  }
  return address;
}

function cleanPublicCandidateAddress(value, item = {}) {
  let address = stripKnownAddressPrefixes(capText(value, 300), item);
  address = repairNearStreetName(address);
  address = punctuateCuXaStreetAddress(address);
  return address
    .replace(/\s+([,.])/g, "$1")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/,\s*0?\d{1,2}\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function publicAddressStreetKey(address) {
  const raw = String(address || "");
  const houseNumber = raw.match(
    /\b\d{1,5}[A-Za-z]?(?:[/-]\d{1,5}[A-Za-z]?)?\b/u,
  );
  const afterHouse = houseNumber
    ? raw.slice(Number(houseNumber.index || 0) + houseNumber[0].length)
    : raw;
  return normalizeVietnameseAddressText(afterHouse)
    .replace(/\b(?:p|phuong|q|quan|district|ward)\s+[a-z0-9].*$/u, "")
    .replace(
      /\b(?:ho chi minh|tp hcm|tphcm|ha noi|da nang|hai phong|can tho)\b.*$/u,
      "",
    )
    .split(" ")
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
}

function publicHouseNumber(address) {
  const raw = String(address || "");
  return (
    raw.match(/\b\d{1,5}[A-Za-z]?(?:[/-]\d{1,5}[A-Za-z]?)?\b/u)?.[0] ||
    vietnamHouseNumbers(address)[0] ||
    ""
  );
}

function candidateAddressInfo(candidate = {}) {
  const address = candidate.address || "";
  const houseNumber = publicHouseNumber(address);
  const streetTokens = matchingVietnamStreetTokens(address);
  const specificStreetTokens = streetTokens.filter(
    (token) => !GENERIC_STREET_TOKENS.has(token),
  );
  const streetKey = publicAddressStreetKey(address);
  return {
    houseNumber,
    houseDigits: houseNumber.replace(/\D/g, ""),
    slashHouseNumber: houseNumber.includes("/"),
    streetKey,
    streetTokenCount: streetKey.split(" ").filter(Boolean).length,
    specificStreetTokens,
    hasAdmin:
      /\b(?:p|phường|phuong|q|quận|quan|district|ward)\s*\.?\s*[a-z0-9]+/iu.test(
        address,
      ),
  };
}

function streetKeysOverlap(left, right) {
  if (!left.streetKey || !right.streetKey) return false;
  const shorter =
    left.streetKey.length <= right.streetKey.length
      ? left.streetKey
      : right.streetKey;
  const longer =
    left.streetKey.length > right.streetKey.length
      ? left.streetKey
      : right.streetKey;
  return (
    shorter.split(" ").length >= 2 &&
    (longer === shorter || longer.startsWith(`${shorter} `))
  );
}

function sameCandidateStreet(left, right) {
  if (streetKeysOverlap(left, right)) return true;
  return left.specificStreetTokens.some((token) =>
    right.specificStreetTokens.includes(token),
  );
}

function isDigitSubsequence(shorter, longer) {
  let index = 0;
  for (const digit of longer) {
    if (digit === shorter[index]) index += 1;
    if (index >= shorter.length) return true;
  }
  return false;
}

function editDistanceAtMostTwo(left, right) {
  if (Math.abs(left.length - right.length) > 2) return false;
  const rows = Array.from({ length: left.length + 1 }, () => []);
  for (let index = 0; index <= left.length; index += 1) rows[index][0] = index;
  for (let index = 0; index <= right.length; index += 1) rows[0][index] = index;
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      rows[leftIndex][rightIndex] = Math.min(
        rows[leftIndex - 1][rightIndex] + 1,
        rows[leftIndex][rightIndex - 1] + 1,
        rows[leftIndex - 1][rightIndex - 1] + cost,
      );
    }
  }
  return rows[left.length][right.length] <= 2;
}

function nearDuplicateSlashAddress(left, right) {
  const leftInfo = candidateAddressInfo(left);
  const rightInfo = candidateAddressInfo(right);
  if (!sameCandidateStreet(leftInfo, rightInfo)) return false;
  if (
    normalizeVietnameseAddressText(left.address) ===
    normalizeVietnameseAddressText(right.address)
  ) {
    return true;
  }
  if (!leftInfo.slashHouseNumber || !rightInfo.slashHouseNumber) return false;
  if (leftInfo.houseNumber === rightInfo.houseNumber) return true;
  if (!leftInfo.houseDigits || !rightInfo.houseDigits) return false;

  const shorter =
    leftInfo.houseDigits.length <= rightInfo.houseDigits.length
      ? leftInfo.houseDigits
      : rightInfo.houseDigits;
  const longer =
    leftInfo.houseDigits.length > rightInfo.houseDigits.length
      ? leftInfo.houseDigits
      : rightInfo.houseDigits;
  return (
    longer.length - shorter.length <= 3 &&
    (isDigitSubsequence(shorter, longer) ||
      editDistanceAtMostTwo(leftInfo.houseDigits, rightInfo.houseDigits))
  );
}

function candidateSupportScore(candidate = {}) {
  const info = candidateAddressInfo(candidate);
  return (
    roundScore(candidate.confidence) * 100 +
    uniqueText(candidate.evidence, 3, 220).length * 8 +
    Number(Boolean(candidate.placeName)) * 10 +
    Number(Boolean(candidate.dishHint)) * 6 +
    Number(Boolean(candidate.locationHint)) * 4 +
    Number(info.hasAdmin) * 10 +
    info.specificStreetTokens.length * 5 +
    Math.min(8, info.streetTokenCount)
  );
}

function preferredAddressCandidate(left, right) {
  const leftSupport = candidateSupportScore(left);
  const rightSupport = candidateSupportScore(right);
  if (Math.abs(leftSupport - rightSupport) >= 6) {
    return rightSupport > leftSupport ? right : left;
  }

  const leftInfo = candidateAddressInfo(left);
  const rightInfo = candidateAddressInfo(right);
  const leftQuality =
    Number(leftInfo.hasAdmin) * 8 +
    leftInfo.specificStreetTokens.length * 4 -
    Math.max(0, leftInfo.houseDigits.length - 4);
  const rightQuality =
    Number(rightInfo.hasAdmin) * 8 +
    rightInfo.specificStreetTokens.length * 4 -
    Math.max(0, rightInfo.houseDigits.length - 4);
  if (leftQuality !== rightQuality)
    return rightQuality > leftQuality ? right : left;

  if (left.address.length !== right.address.length) {
    return right.address.length < left.address.length ? right : left;
  }
  return roundScore(right.confidence) > roundScore(left.confidence)
    ? right
    : left;
}

function mergeAddressCandidates(primary, secondary) {
  const merged = {
    ...primary,
    confidence: roundScore(
      Math.max(
        Number(primary.confidence) || 0,
        Number(secondary.confidence) || 0,
      ),
    ),
    evidence: uniqueText(
      [
        ...(Array.isArray(primary.evidence) ? primary.evidence : []),
        ...(Array.isArray(secondary.evidence) ? secondary.evidence : []),
      ],
      3,
      220,
    ),
    reviewRequired: true,
  };
  for (const key of ["placeName", "dishHint", "locationHint"]) {
    if (!merged[key] && secondary[key]) merged[key] = secondary[key];
  }
  return merged;
}

function postCleanPublicAddressCandidates(items = []) {
  const result = [];
  for (const item of items) {
    const existingIndex = result.findIndex((existing) =>
      nearDuplicateSlashAddress(existing, item),
    );
    if (existingIndex < 0) {
      result.push(item);
      continue;
    }

    const existing = result[existingIndex];
    const preferred = preferredAddressCandidate(existing, item);
    const secondary = preferred === existing ? item : existing;
    result[existingIndex] = mergeAddressCandidates(preferred, secondary);
  }
  return result;
}
function removeVietnameseMarksForVision(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function normalizeAddressTextForVision(value = "") {
  return removeVietnameseMarksForVision(value)
    .replace(/[,.;:()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePublicCandidateAddressHead(address = "") {
  const cleaned = String(address || "")
    .replace(/\s+/g, " ")
    .trim();

  const slashMatch = cleaned.match(
    /^(\d+[a-zA-Z]?\s*\/\s*\d+[a-zA-Z]?)\s+(.+)$/,
  );
  if (slashMatch) {
    return {
      kind: "slash",
      number: slashMatch[1].replace(/\s+/g, ""),
      rest: slashMatch[2],
    };
  }

  const gluedMatch = cleaned.match(/^(\d{4,5})\s+(.+)$/);
  if (gluedMatch) {
    return {
      kind: "glued",
      number: gluedMatch[1],
      rest: gluedMatch[2],
    };
  }

  return null;
}

function publicCandidateStreetKey(address = "") {
  const parsed = parsePublicCandidateAddressHead(address);
  if (!parsed?.rest) return "";

  return (
    normalizeAddressTextForVision(parsed.rest)
      // bỏ phần phường/quận trở về sau để lấy key tên đường
      .replace(/\b(phuong|p|quan|q|district|ward)\b.*$/i, "")
      .replace(/\b(tp|thanh pho|hcm|ho chi minh)\b.*$/i, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function publicAddressHasSlashNumber(address = "") {
  return parsePublicCandidateAddressHead(address)?.kind === "slash";
}

function publicAddressHasGluedNumber(address = "") {
  return parsePublicCandidateAddressHead(address)?.kind === "glued";
}

function mergeCandidateEvidence(target, source) {
  return {
    ...target,
    evidence: [
      ...new Set([
        ...(Array.isArray(target.evidence) ? target.evidence : []),
        ...(Array.isArray(source.evidence) ? source.evidence : []),
      ]),
    ].slice(0, 8),
    confidence: Math.max(
      Number(target.confidence || 0),
      Number(source.confidence || 0),
    ),
  };
}

function mergeSlashAndGluedAddressCandidates(candidates = []) {
  const result = [];

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const address = candidate?.address || "";
    const streetKey = publicCandidateStreetKey(address);

    if (!streetKey) {
      result.push(candidate);
      continue;
    }

    // Nếu candidate hiện tại là glued number như 4579,
    // mà đã có slash candidate cùng đường như 45/9,
    // thì merge evidence vào slash candidate, không show glued candidate.
    if (publicAddressHasGluedNumber(address)) {
      const existingSlashIndex = result.findIndex((item) => {
        return (
          publicAddressHasSlashNumber(item?.address) &&
          publicCandidateStreetKey(item?.address) === streetKey
        );
      });

      if (existingSlashIndex >= 0) {
        result[existingSlashIndex] = mergeCandidateEvidence(
          result[existingSlashIndex],
          candidate,
        );
        continue;
      }
    }

    // Nếu candidate hiện tại là slash như 45/9,
    // mà trước đó đã có glued cùng đường như 4579,
    // thì thay glued bằng slash, merge evidence.
    if (publicAddressHasSlashNumber(address)) {
      const existingGluedIndex = result.findIndex((item) => {
        return (
          publicAddressHasGluedNumber(item?.address) &&
          publicCandidateStreetKey(item?.address) === streetKey
        );
      });

      if (existingGluedIndex >= 0) {
        result[existingGluedIndex] = mergeCandidateEvidence(
          candidate,
          result[existingGluedIndex],
        );
        continue;
      }
    }

    result.push(candidate);
  }

  return result;
}
function publicAddressCandidates(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const placeName = item?.placeName ? capText(item.placeName, 180) : null;
      const dishHint = item?.dishHint ? capText(item.dishHint, 100) : null;
      const locationHint = item?.locationHint
        ? capText(item.locationHint, 100)
        : null;
      return {
        address: item?.address
          ? cleanPublicCandidateAddress(item.address, item)
          : null,
        confidence: roundScore(item?.confidence),
        source: item?.source ? capText(item.source, 40) : null,
        timestampSeconds: Number.isFinite(Number(item?.timestampSeconds))
          ? Math.round(Number(item.timestampSeconds) * 1000) / 1000
          : null,
        evidence: uniqueText(item?.evidence, 3, 220),
        ...(placeName ? { placeName } : {}),
        ...(dishHint ? { dishHint } : {}),
        ...(locationHint ? { locationHint } : {}),
        reviewRequired: true,
      };
    })
    .filter(
      (item) =>
        item.address &&
        item.source &&
        Number.isFinite(Number(item.timestampSeconds)),
    )
    .reduce(
      (result, item) => postCleanPublicAddressCandidates([...result, item]),
      [],
    )
    .slice(0, 8);
}

function publicGeminiCandidateDebug(debug = {}) {
  const status = capText(debug.geminiCandidateExtractionStatus, 60);
  if (!GEMINI_CANDIDATE_EXTRACTION_STATUSES.has(status)) return {};
  const acceptedCount = Number(debug.geminiCandidateAcceptedCount);
  const rejectedCount = Number(debug.geminiCandidateRejectedCount);
  const skipReason = debug.geminiCandidateExtractionSkipReason
    ? capText(debug.geminiCandidateExtractionSkipReason, 100)
    : null;
  return {
    geminiCandidateExtractionStatus: status,
    geminiCandidateAcceptedCount: Number.isFinite(acceptedCount)
      ? Math.max(0, Math.min(24, Math.round(acceptedCount)))
      : 0,
    geminiCandidateRejectedCount: Number.isFinite(rejectedCount)
      ? Math.max(0, Math.min(24, Math.round(rejectedCount)))
      : 0,
    geminiCandidateExtractionSkipReason: skipReason,
  };
}

function publicDebugDetails(debug = {}) {
  const attemptedTimestamps = (
    Array.isArray(debug.frameOcrAttemptedTimestamps)
      ? debug.frameOcrAttemptedTimestamps
      : []
  )
    .map(Number)
    .filter(Number.isFinite)
    .map((value) => Math.round(value * 1000) / 1000)
    .slice(0, 60);
  return {
    ...(debug.frameScanMode
      ? { frameScanMode: capText(debug.frameScanMode, 30) }
      : {}),
    ...(Number.isFinite(Number(debug.frameDurationSeconds))
      ? { frameDurationSeconds: Number(debug.frameDurationSeconds) }
      : {}),
    ...(Number.isFinite(Number(debug.frameCount))
      ? { frameCount: Math.max(0, Math.min(60, Number(debug.frameCount))) }
      : {}),
    ...(attemptedTimestamps.length
      ? { frameOcrAttemptedTimestamps: attemptedTimestamps }
      : {}),
    ...(debug.geminiOcrRepairStatus
      ? {
          geminiOcrRepairStatus: capText(debug.geminiOcrRepairStatus, 60),
        }
      : {}),
    ...publicGeminiCandidateDebug(debug),
    ...(debug.errorName ? { errorName: capText(debug.errorName, 80) } : {}),
    ...(debug.errorCode ? { errorCode: capText(debug.errorCode, 80) } : {}),
  };
}

export function buildVisionAutoResponse({
  status,
  confidence = 0,
  input,
  normalizedEvidence = {},
  entities = {},
  placeCandidates = [],
  candidates = [],
  bestResult = null,
  addPlaceDraft = null,
  reason = "",
  steps = [],
  warnings = [],
  debugLevel = "summary",
  debug = {},
} = {}) {
  if (!STATUSES.has(status)) {
    throw new Error(`Unsupported Vision Auto status: ${status}`);
  }

  const publicWarnings = [...new Set(warningCodes(warnings))].slice(0, 16);
  return {
    status,
    confidence: roundScore(confidence),
    input: {
      type: input?.type || "uploaded_image",
      url: safeUrl(input?.url),
    },
    evidenceSummary: {
      metadata: publicMetadata(normalizedEvidence.metadata),
      ocrLines: uniqueText(normalizedEvidence.ocrLines, 20, 220),
      frameEvidence: publicFrameEvidence(normalizedEvidence.frameEvidence),
      frameTexts: uniqueText(normalizedEvidence.frameTexts, 12, 220),
      audioTexts: uniqueText(normalizedEvidence.audioTexts, 12, 220),
      warnings: publicWarnings,
    },
    entities: {
      placeName: publicNamedEntity(entities.placeName),
      address: publicNamedEntity(entities.address),
      phones: publicArrayEntities(entities.phones),
      dishNames: publicArrayEntities(entities.dishNames),
      locationHints: publicArrayEntities(entities.locationHints, {
        includeType: true,
      }),
    },
    placeCandidates: (Array.isArray(placeCandidates) ? placeCandidates : [])
      .map(publicCandidate)
      .filter(Boolean)
      .slice(0, 5),
    bestResult: publicCandidate(bestResult),
    addPlaceDraft: publicDraft(addPlaceDraft),
    ...(status === "multi_candidate"
      ? {
          candidates: publicAddressCandidates(candidates),
          reviewRequired: true,
        }
      : {}),
    reason: capText(reason, 500),
    debug: {
      steps: debugLevel === "none" ? [] : uniqueText(steps, 24, 80),
      warnings: debugLevel === "none" ? [] : publicWarnings,
      ...publicGeminiCandidateDebug(debug),
      ...(debugLevel === "none" ? {} : publicDebugDetails(debug)),
    },
  };
}

export { STATUSES as VISION_AUTO_STATUSES };
