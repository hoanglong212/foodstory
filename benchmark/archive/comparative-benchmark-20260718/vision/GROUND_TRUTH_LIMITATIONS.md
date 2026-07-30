# Vision Ground-Truth Limitations

The recovered 30-case corpus labels only safe routing between Track 1 and Track 2. It contains expected textual address evidence for some cases but does not provide verified place identities, dish labels, media files, frame-level OCR truth, or provider-independent stage timings.

Consequently, this benchmark reports safe-routing accuracy and false-promotion rate only. Exact-place accuracy, address precision/recall, dish top-1 accuracy, dish top-3 recall, frame/OCR correlations, and full Vision Auto latency are not calculated. Blank values mean unsupported, not zero.

The early Vision snapshot cannot consume the later 30-case corpus through an equivalent deterministic interface. The final commit no longer includes this fixture; the immutable copy from Track 2 V3 commit `852d5735c5e20abf995ffa3a4e096e04add88586` is replayed against both compatible router implementations with network access blocked.
