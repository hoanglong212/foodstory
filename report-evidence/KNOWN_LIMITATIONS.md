# Known Limitations

- No statistically significant real-user traffic or usability study has been completed.
- The Admin Dashboard UX requires further validation with real administrators and larger datasets.
- Current asynchronous video jobs accept public YouTube videos and Shorts only.
- The exact original restaurant may be unresolvable when the source contains no reliable location evidence.
- Dish recognition does not prove where a video was filmed.
- Serving-place search returns reviewable candidates or alternatives, not confirmed original matches.
- Guardian, Google Places, Google Vision, Gemini and ASR behavior depends on provider configuration, quotas, network access and terms.
- The Vision Auto queue is in-memory and single-process; jobs are not durable across restarts and do not distribute across instances.
- WebSocket recipe rooms are in-memory and single-process; horizontal scaling needs a shared pub/sub layer.
- Frontend automated coverage is focused and does not cover every visual state or browser combination.
- FFmpeg, yt-dlp and optional OCR binaries are local runtime dependencies whose versions/availability can differ by machine.
- SentenceTransformer/OpenCLIP model load and inference performance differs substantially between CPU and GPU environments.
- JWT browser storage is convenient for this academic application but requires XSS discipline; a production deployment should evaluate secure same-site cookies and revocation.
- The map's current-origin/geolocation result depends on browser permission and device accuracy.
- Marker clustering and large-result performance were not stress-tested at production scale.
- The current external news cache and Vision/WebSocket state are process-local.
- A disposable banned-account runtime test was not performed because the available admin ban action removes engagement from the shared seeded user.
- Terminal screenshots require a manual desktop capture; browser automation cannot capture terminal pixels in this environment.
