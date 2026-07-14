/**
 * Legacy compatibility boundary.
 *
 * Place resolution now runs after Track 2 V3 evidence extraction in the
 * Vision Auto adapter. That boundary can first match local Food Map markers
 * from strong address evidence and optionally use Google Places when a key is
 * configured. Do not duplicate provider resolution inside the OCR pipeline.
 */
export async function runShortsTrack2V3PlacesUpgrade() {
  return {
    status: 'DEPRECATED',
    reason: 'TRACK2_V3_PLACES_RESOLUTION_MOVED_TO_VISION_AUTO_ADAPTER',
    called: false,
    queries: [],
    providerErrors: [],
  }
}
