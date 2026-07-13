/**
 * Intentionally disabled in Track 2 V3.
 *
 * Gemini is allowed to select existing crop IDs through Gemini Crop Judge,
 * but it must not generate, repair, normalize, or infer address text. Keeping
 * this explicit service makes legacy callers fail closed without pretending
 * that an address-generation stage is still waiting to be implemented.
 */
export async function runShortsTrack2V3GeminiVision() {
  return {
    status: 'POLICY_DISABLED',
    reason: 'TRACK2_V3_GEMINI_ADDRESS_GENERATION_FORBIDDEN',
    called: false,
    evidence: [],
    providerErrors: [],
  }
}
