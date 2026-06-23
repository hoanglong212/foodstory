import { extractOcrEvidenceWithProvider } from "./ocrProviders/index.js";
import {
  detectSocialPlatform,
  extractSocialUrlSignals,
  fetchPublicImageBuffer,
} from "./socialUrlExtractionService.js";
import { resolveBlogUrl } from "./socialUrlProviders/blogUrlProvider.js";
import { resolveGenericSocialUrl } from "./socialUrlProviders/genericSocialUrlProvider.js";
import { resolveYouTubeUrl } from "./socialUrlProviders/youtubeUrlProvider.js";

const MAX_TEXT_SOURCES = 24;
const MAX_MEDIA_SOURCES = 6;
const DEFAULT_MEDIA_BYTES = 3_000_000;
const DEFAULT_THUMBNAIL_OCR_TIMEOUT_MS = 8_000;

function cleanText(value, maximumLength = 700) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, maximumLength) : "";
}

function enabled(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return !["false", "0", "no", "off"].includes(
    String(value).trim().toLowerCase(),
  );
}

function boundedWarnings(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => cleanText(value, 180))
        .filter(Boolean),
    ),
  ].slice(0, 12);
}

function uniqueTextSources(values) {
  const result = [];
  const seen = new Set();
  for (const value of values.filter(Boolean)) {
    const text = cleanText(value.text);
    const type = cleanText(value.type, 40);
    const key = `${type}:${text.toLowerCase()}`;
    if (!type || !text || seen.has(key)) continue;
    seen.add(key);
    result.push({
      type,
      text,
      confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
      source: cleanText(value.source, 120) || "unknown",
    });
    if (result.length >= MAX_TEXT_SOURCES) break;
  }
  return result;
}

function uniqueMediaSources(values) {
  const result = [];
  const seen = new Set();
  for (const value of values.filter(Boolean)) {
    const key = value.url
      ? `url:${value.url}`
      : value.buffer
        ? `buffer:${value.source}:${value.buffer.length}`
        : "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({
      type: value.type,
      ...(value.url ? { url: value.url } : {}),
      ...(Buffer.isBuffer(value.buffer) ? { buffer: value.buffer } : {}),
      ...(value.mimeType ? { mimeType: value.mimeType } : {}),
      source: value.source || "unknown",
    });
    if (result.length >= MAX_MEDIA_SOURCES) break;
  }
  return result;
}

function sourceText(textSources, type) {
  return (
    textSources.find((source) => source?.type === type && source?.text)?.text ||
    null
  );
}

function boundedStringArray(values, maximumItems = 5, maximumLength = 700) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => cleanText(value, maximumLength))
        .filter(Boolean),
    ),
  ].slice(0, maximumItems);
}

async function withTimeout(operation, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Thumbnail OCR timed out.");
          error.code = "thumbnail_ocr_timeout";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function inputType({ url, image, providerType }) {
  if (url && image) return "mixed";
  if (url) return providerType;
  if (image) return "image";
  return "hint_only";
}

function providerForUrl(url) {
  const platform = detectSocialPlatform(url);
  if (platform === "youtube") {
    return {
      platform,
      type: "youtube_url",
      resolver: resolveYouTubeUrl,
    };
  }
  if (["tiktok", "instagram", "facebook"].includes(platform)) {
    return {
      platform,
      type: "generic_social_url",
      resolver: resolveGenericSocialUrl,
    };
  }
  return {
    platform: platform === "web" ? "blog" : "unknown",
    type: platform === "web" ? "blog_url" : "generic_social_url",
    resolver: platform === "web" ? resolveBlogUrl : resolveGenericSocialUrl,
  };
}

async function defaultMetadataOcr({ image }) {
  return extractOcrEvidenceWithProvider(
    { image },
    { provider: "google_vision" },
  );
}

export async function resolveSocialInput(
  { url = "", image = null, hint = "" } = {},
  {
    extractUrlSignals = extractSocialUrlSignals,
    blogProvider = resolveBlogUrl,
    youtubeProvider = resolveYouTubeUrl,
    genericSocialProvider = resolveGenericSocialUrl,
    providerOptions = {},
    downloadMedia = fetchPublicImageBuffer,
    extractMetadataOcr = defaultMetadataOcr,
    metadataOcrEnabled = enabled(process.env.IMAGE_METADATA_OCR_ENABLED, true),
    metadataOcrMaxBytes = Number(
      process.env.SOCIAL_THUMBNAIL_MAX_BYTES || DEFAULT_MEDIA_BYTES,
    ),
    metadataOcrTimeoutMs = Number(
      process.env.SOCIAL_THUMBNAIL_OCR_TIMEOUT_MS ||
        DEFAULT_THUMBNAIL_OCR_TIMEOUT_MS,
    ),
  } = {},
) {
  const cleanedUrl = cleanText(url, 2_000);
  const cleanedHint = cleanText(hint, 500);
  const selected = cleanedUrl ? providerForUrl(cleanedUrl) : null;
  let providerResult = {
    platform: selected?.platform || "unknown",
    sourceUrl: cleanedUrl || null,
    textSources: [],
    mediaSources: [],
    warnings: [],
    debug: {
      provider: null,
      extractionStatus: null,
    },
  };

  if (selected) {
    const selectedProvider =
      selected.type === "youtube_url"
        ? youtubeProvider
        : selected.type === "blog_url"
          ? blogProvider
          : genericSocialProvider;
    try {
      providerResult = await selectedProvider(
        {
          url: cleanedUrl,
          platform: selected.platform,
        },
        {
          extractUrlSignals,
          ...providerOptions,
        },
      );
    } catch {
      providerResult = {
        ...providerResult,
        warnings: ["metadata_blocked_or_empty"],
        debug: {
          provider: selected.type,
          extractionStatus: "provider_error",
        },
      };
    }
  }

  const textSources = [
    ...(providerResult.textSources || []),
    cleanedHint
      ? {
          type: "user_hint",
          text: cleanedHint,
          confidence: 0.95,
          source: "user_hint",
        }
      : null,
  ];
  const mediaSources = [
    ...(providerResult.mediaSources || []),
    image?.buffer
      ? {
          type: "uploaded_image",
          buffer: image.buffer,
          mimeType: image.mimetype || null,
          source: "user_upload",
        }
      : null,
  ];
  const warnings = [...(providerResult.warnings || [])];
  const remoteMedia = mediaSources.find(
    (media) => media?.url && ["thumbnail", "og_image"].includes(media.type),
  );
  let mediaOcrEvidence = null;
  let mediaOcrStatus = metadataOcrEnabled
    ? remoteMedia
      ? "pending"
      : "not_available"
    : "disabled";

  if (metadataOcrEnabled && remoteMedia?.url) {
    try {
      const downloaded = await downloadMedia(
        { url: remoteMedia.url },
        {
          maxResponseBytes: Math.max(
            100_000,
            Math.min(
              5_000_000,
              Number(metadataOcrMaxBytes) || DEFAULT_MEDIA_BYTES,
            ),
          ),
          ...(providerOptions.imageDownloadOptions || {}),
        },
      );
      if (downloaded?.status === "success" && downloaded.buffer) {
        mediaOcrEvidence = await withTimeout(
          () =>
            extractMetadataOcr({
              image: {
                buffer: downloaded.buffer,
                mimetype: downloaded.contentType,
                originalname:
                  remoteMedia.type === "thumbnail"
                    ? "social-thumbnail"
                    : "social-metadata-image",
              },
              mediaSource: remoteMedia,
            }),
          Math.max(
            200,
            Math.min(
              30_000,
              Number(metadataOcrTimeoutMs) ||
                DEFAULT_THUMBNAIL_OCR_TIMEOUT_MS,
            ),
          ),
        );
        mediaOcrStatus = mediaOcrEvidence?.usable
          ? "usable"
          : mediaOcrEvidence?.reason || "weak";
        if (mediaOcrEvidence?.text) {
          textSources.push({
            type:
              remoteMedia.type === "thumbnail" ? "thumbnail_ocr" : "image_ocr",
            text: mediaOcrEvidence.text,
            confidence: Number(mediaOcrEvidence.confidence || 0),
            source: remoteMedia.source || remoteMedia.url,
          });
        } else {
          warnings.push(
            remoteMedia.type === "thumbnail"
              ? "thumbnail_ocr_failed"
              : "metadata_image_ocr_failed",
          );
        }
      } else {
        mediaOcrStatus = downloaded?.status || "download_failed";
        warnings.push(
          remoteMedia.type === "thumbnail"
            ? "thumbnail_ocr_failed"
            : "metadata_image_download_failed",
        );
        warnings.push(...(downloaded?.warnings || []));
      }
    } catch (error) {
      mediaOcrStatus =
        error?.code === "thumbnail_ocr_timeout" ? "timeout" : "failed";
      warnings.push(
        remoteMedia.type === "thumbnail"
          ? "thumbnail_ocr_failed"
          : "metadata_image_ocr_failed",
      );
    }
  }

  const finalTextSources = uniqueTextSources(textSources);
  const finalMediaSources = uniqueMediaSources(mediaSources);
  const resolvedInputType = inputType({
    url: cleanedUrl,
    image,
    providerType: selected?.type,
  });
  const finalWarnings = boundedWarnings(warnings);
  const providerEvidence = providerResult.debug?.evidence || {};
  const urlEvidence = cleanedUrl
    ? {
        platform:
          providerResult.platform || selected?.platform || "unknown",
        provider:
          providerResult.debug?.provider || selected?.type || null,
        resolvedInputType,
        extractionStatus:
          providerResult.debug?.extractionStatus || null,
        videoId:
          cleanText(providerResult.debug?.videoId, 32) ||
          null,
        title:
          cleanText(providerEvidence.title, 500) ||
          sourceText(finalTextSources, "title"),
        description:
          cleanText(providerEvidence.description, 700) ||
          sourceText(finalTextSources, "description"),
        channelTitle:
          cleanText(providerEvidence.channelTitle, 300) ||
          sourceText(finalTextSources, "youtube_channel"),
        publishedAt:
          cleanText(providerEvidence.publishedAt, 80) ||
          sourceText(finalTextSources, "youtube_published_at"),
        ogTitle:
          cleanText(providerEvidence.ogTitle, 500) ||
          sourceText(finalTextSources, "og_title"),
        ogDescription:
          cleanText(providerEvidence.ogDescription, 700) ||
          sourceText(finalTextSources, "og_description"),
        jsonLdEvidence: boundedStringArray(
          providerEvidence.jsonLdEvidence ||
            finalTextSources
              .filter((source) => source.type === "json_ld")
              .map((source) => source.text),
        ),
        thumbnailUrl:
          cleanText(providerEvidence.thumbnailUrl, 2_048) ||
          cleanText(remoteMedia?.url, 2_048) ||
          null,
        thumbnailOcrStatus: mediaOcrStatus,
        warnings: finalWarnings,
      }
    : null;
  return {
    inputType: resolvedInputType,
    sourceUrl: providerResult.sourceUrl || cleanedUrl || null,
    platform:
      providerResult.platform ||
      selected?.platform ||
      (cleanedUrl ? "unknown" : "unknown"),
    textSources: finalTextSources,
    mediaSources: finalMediaSources,
    warnings: finalWarnings,
    debug: {
      provider: providerResult.debug?.provider || selected?.type || null,
      extractionStatus: providerResult.debug?.extractionStatus || null,
      metadataOcrStatus: mediaOcrStatus,
      textSourceCount: finalTextSources.length,
      mediaSourceCount: finalMediaSources.length,
      ...(providerResult.debug?.videoId
        ? { videoId: providerResult.debug.videoId }
        : {}),
      ...(providerResult.debug?.apiStatus
        ? { apiStatus: providerResult.debug.apiStatus }
        : {}),
      ...(providerResult.debug?.canonicalUrl
        ? { canonicalUrl: providerResult.debug.canonicalUrl }
        : {}),
      ...(providerResult.debug?.siteName
        ? { siteName: providerResult.debug.siteName }
        : {}),
      ...(urlEvidence ? { urlEvidence } : {}),
    },
    mediaOcrEvidence,
  };
}

export {
  enabled as socialMetadataOcrEnabled,
  providerForUrl as socialProviderForUrl,
};

export default resolveSocialInput;
