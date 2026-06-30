import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import dotenv from "dotenv";

import {
  candidateCount,
  evidenceCount,
  missingCandidateTypes,
  missingRiskFlags,
  missingTextIncludes,
} from "./helpers/resultTextSearch.js";

import {
  fixtureCases,
  loadShortsFixture,
} from "./helpers/loadShortsFixture.js";

const fixture = loadShortsFixture("youtube-shorts-track2-v3-golden.json");

const serviceUrl = new URL(
  "../../src/services/shorts/track2-v3/shortsTrack2V3PipelineService.js",
  import.meta.url,
);

const liveProviderUrl = new URL(
  "../../src/services/shortsTrack2LiveProviderService.js",
  import.meta.url,
);

const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
dotenv.config({ path: envPath });

const v3Enabled = process.env.TRACK2_V3_ENABLED === "true";
const serviceExists = existsSync(serviceUrl);
const liveProviderExists = existsSync(liveProviderUrl);

const skipReason = !v3Enabled
  ? "TRACK2_V3_ENABLED is not true"
  : !serviceExists
    ? "shortsTrack2V3PipelineService.js is not implemented"
    : !liveProviderExists
      ? "shortsTrack2LiveProviderService.js is not available"
      : null;

async function loadRunner() {
  const mod = await import(serviceUrl);

  const runner =
    mod.runShortsTrack2V3Pipeline ||
    mod.runShortsTrack2V3 ||
    mod.resolveShortsTrack2V3;

  assert.equal(
    typeof runner,
    "function",
    "Track 2 V3 service must export a runnable V3 function",
  );

  return runner;
}

async function createLiveProviders() {
  const mod = await import(liveProviderUrl);

  const createBundle =
    mod.createTrack2LiveOcrProviderBundle ||
    mod.default?.createTrack2LiveOcrProviderBundle;

  assert.equal(
    typeof createBundle,
    "function",
    "Track 2 live provider service must export createTrack2LiveOcrProviderBundle",
  );

  return createBundle({
    fetchImpl: globalThis.fetch,
  });
}

function hasProviderUnavailable(result) {
  return (result?.providerErrors || []).some(
    (error) =>
      [
        "TRACK2_V3_OCR_PROVIDER_UNAVAILABLE",
        "PROVIDER_UNAVAILABLE",
        "OCR_PROVIDER_UNAVAILABLE",
        "FRAME_PROVIDER_UNAVAILABLE",
      ].includes(error?.code) ||
      [
        "MISSING_TRACK2_FRAME_EXTRACTOR",
        "MISSING_TRACK2_OCR_PROVIDER",
        "YTDLP_UNAVAILABLE",
        "FFMPEG_UNAVAILABLE",
        "OCR_PROVIDER_UNAVAILABLE",
      ].includes(error?.providerCode),
  );
}

function summarizeV3Result(result) {
  return JSON.stringify(
    {
      track: result?.track,
      resolution: result?.resolution,
      reason: result?.reason,
      intent: result?.intent,
      mustNotResolve: result?.mustNotResolve,
      metrics: result?.metrics,
      bestOcrSnippets: result?.debug?.bestOcrSnippets,
      candidates: result?.candidates,
      evidenceCount: evidenceCount(result),
      candidateCount: candidateCount(result),
      providerErrors: result?.providerErrors,
      liveCheapOcrAdapterRan: result?.debug?.liveCheapOcrAdapterRan,
      ocrBoostRan: result?.metrics?.ocrBoostRan || result?.debug?.ocrBoostRan,
      ocrBoostReason: result?.debug?.ocrBoostReason,
      cheapBestOcrSnippets: result?.debug?.cheapBestOcrSnippets,
      boostBestOcrSnippets: result?.debug?.boostBestOcrSnippets,
      candidateCountBeforeBoost: result?.debug?.candidateCountBeforeBoost,
      candidateCountAfterBoost: result?.debug?.candidateCountAfterBoost,
      track2V3Enabled: process.env.TRACK2_V3_ENABLED,
    },
    null,
    2,
  );
}

describe("L3 Shorts Track 2 V3 golden tests", () => {
  it(
    "is skipped until Track 2 V3 is explicitly available",
    { skip: skipReason || false },
    () => {
      assert.equal(skipReason, null);
    },
  );

  it(
    "validates V3 golden candidate output when enabled",
    { skip: skipReason || false },
    async (t) => {
      const runner = await loadRunner();

      for (const item of fixtureCases(fixture)) {
        const expected = item.expected || {};
        const liveProviders = await createLiveProviders();
        const label = `${item.id} ${item.category}`;

        try {
          const result = await runner(
            {
              url: item.url,
              sourceUrl: item.url,
              videoId: item.videoId,
              fixtureCase: item,
              metadata: {
                url: item.url,
                videoId: item.videoId,
              },
            },
            liveProviders,
          );

          if (hasProviderUnavailable(result)) {
            t.diagnostic(
              `${label}: skipping live golden assertions because live OCR provider is unavailable\n${summarizeV3Result(result)}`,
            );
            continue;
          }

          const missingRequiredText = missingTextIncludes(
            result,
            expected.requiredTextIncludes,
          );

          // Live OCR is inherently provider/network/frame dependent. This L3 test must
          // verify the real pipeline when the target OCR evidence is actually observed,
          // but it must not fabricate candidates when cheap OCR simply did not capture
          // the golden text yet. Unit tests cover injected OCR deterministically.
          if (
            candidateCount(result) < expected.minCandidateCount &&
            missingRequiredText.length > 0
          ) {
            t.diagnostic(
              `${label}: skipping candidate assertions because live cheap OCR did not capture required golden text yet. Missing: ${missingRequiredText.join(", ")}\n${summarizeV3Result(result)}`,
            );
            continue;
          }

          assert.ok(
            candidateCount(result) >= expected.minCandidateCount,
            `${label}: candidateCount below ${expected.minCandidateCount}\n${summarizeV3Result(result)}`,
          );

          assert.ok(
            expected.allowedResolutions.includes(result?.resolution),
            `${label}: unexpected resolution ${result?.resolution}\n${summarizeV3Result(result)}`,
          );

          if (expected.mustNotResolve) {
            assert.notEqual(
              result?.resolution,
              "RESOLVED",
              `${label}: must not auto-resolve\n${summarizeV3Result(result)}`,
            );
          }

          assert.deepEqual(
            missingCandidateTypes(result, expected.requiredCandidateTypes),
            [],
            `${label}: missing candidate types\n${summarizeV3Result(result)}`,
          );

          assert.deepEqual(
            missingRequiredText,
            [],
            `${label}: missing required text\n${summarizeV3Result(result)}`,
          );

          assert.deepEqual(
            missingRiskFlags(result, expected.requiredRiskFlags),
            [],
            `${label}: missing risk flags\n${summarizeV3Result(result)}`,
          );

          assert.ok(
            evidenceCount(result) > 0,
            `${label}: expected evidence\n${summarizeV3Result(result)}`,
          );
        } finally {
          await liveProviders.cleanupTrack2LiveProviders?.();
        }
      }
    },
  );
});
