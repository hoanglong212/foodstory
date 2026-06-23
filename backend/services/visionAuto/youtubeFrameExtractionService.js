import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseYouTubeVideoId } from "../socialUrlProviders/youtubeUrlProvider.js";

const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
const MAX_FRAME_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_FRAME_BYTES = 16 * 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 8 * 1024 * 1024;

const YT_DLP_BIN = process.env.YOUTUBE_YT_DLP_PATH || 'yt-dlp';
const FFMPEG_BIN = process.env.YOUTUBE_FFMPEG_PATH || 'ffmpeg';
const FFPROBE_BIN = process.env.YOUTUBE_FFPROBE_PATH || 'ffprobe';

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function roundNumber(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function warningCodes(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) =>
          String(value || "")
            .trim()
            .toLowerCase(),
        )
        .filter((value) => /^[a-z0-9_]{2,100}$/.test(value)),
    ),
  ].slice(0, 12);
}

function bufferOverflow(error) {
  return /maxBuffer/i.test(String(error?.message || ""));
}

function timedOut(error) {
  if (bufferOverflow(error)) return false;
  return Boolean(
    error?.code === "youtube_frame_scan_timeout" ||
    error?.code === "ETIMEDOUT" ||
    error?.killed === true ||
    error?.signal === "SIGTERM",
  );
}

function missingBinary(error) {
  return Boolean(
    error?.code === "ENOENT" || error?.code === 127 || error?.code === 9009,
  );
}

function defaultRunCommand(command, args, { timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        windowsHide: true,
        timeout: Math.max(100, Number(timeoutMs) || 1_000),
        maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          if (timedOut(error)) error.code = "youtube_frame_scan_timeout";
          error.stdout = String(stdout || "").slice(0, MAX_COMMAND_OUTPUT_BYTES);
          error.stderr = String(stderr || "").slice(0, MAX_COMMAND_OUTPUT_BYTES);
          reject(error);
          return;
        }
        resolve({
          stdout: String(stdout || "").slice(0, MAX_COMMAND_OUTPUT_BYTES),
          stderr: String(stderr || "").slice(0, MAX_COMMAND_OUTPUT_BYTES),
        });
      },
    );
  });
}

function binaryName(command) {
  return path.basename(String(command || '')).replace(/\.exe$/i, '').toLowerCase();
}

async function probeBinary(command, runCommand, timeoutMs) {
  try {
    await runCommand(
      command,
      ["ffmpeg", "ffprobe"].includes(binaryName(command)) ? ["-version"] : ["--version"],
      { timeoutMs },
    );
    return { available: true, timedOut: false };
  } catch (error) {
    return {
      available: false,
      timedOut: timedOut(error),
      missing: missingBinary(error),
    };
  }
}

export async function checkYouTubeFrameScanBinaries(
  { timeoutMs = 2_000 } = {},
  { runCommand = defaultRunCommand } = {},
) {
  const boundedTimeout = boundedInteger(timeoutMs, 2_000, 100, 5_000);
  const [ytDlp, ffmpeg, ffprobe] = await Promise.all([
    probeBinary(YT_DLP_BIN, runCommand, boundedTimeout),
    probeBinary(FFMPEG_BIN, runCommand, boundedTimeout),
    probeBinary(FFPROBE_BIN, runCommand, boundedTimeout),
  ]);
  return {
    ytDlpAvailable: ytDlp.available === true,
    ffmpegAvailable: ffmpeg.available === true,
    ffprobeAvailable: ffprobe.available === true,
    timedOut: ytDlp.timedOut === true || ffmpeg.timedOut === true,
    ffprobeTimedOut: ffprobe.timedOut === true,
  };
}

function parseDurationString(value) {
  const parts = String(value || "")
    .trim()
    .split(":")
    .map(Number);
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((part) => !Number.isFinite(part) || part < 0)
  ) {
    return null;
  }
  const seconds =
    parts.length === 3
      ? parts[0] * 3_600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + parts[1];
  return seconds > 0 ? roundNumber(seconds) : null;
}

function positiveDuration(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return roundNumber(number);
}

function durationFromMetadata(value) {
  if (!value || typeof value !== "object") return null;
  const direct =
    positiveDuration(value.duration) ||
    parseDurationString(value.duration_string);
  if (direct) return direct;

  const approximate = positiveDuration(value.approx_duration);
  if (approximate) return approximate;

  for (const child of [
    ...(Array.isArray(value.requested_formats) ? value.requested_formats : []),
    ...(Array.isArray(value.formats) ? value.formats : []),
  ].slice(0, 200)) {
    const childDuration =
      positiveDuration(child?.duration) ||
      positiveDuration(child?.approx_duration);
    if (childDuration) return childDuration;
  }
  return null;
}

function parseDuration(stdout) {
  const output = String(stdout || "").trim();
  if (!output) return null;
  try {
    const parsed = JSON.parse(output);
    const duration = durationFromMetadata(parsed);
    if (duration) return duration;
  } catch {
    // Some yt-dlp versions may emit a compact value instead of JSON.
  }
  const firstObject = output.indexOf("{");
  const lastObject = output.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    try {
      const duration = durationFromMetadata(
        JSON.parse(output.slice(firstObject, lastObject + 1)),
      );
      if (duration) return duration;
    } catch {
      // Ignore bounded warning/status text around otherwise invalid JSON.
    }
  }
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    try {
      const duration = durationFromMetadata(JSON.parse(text));
      if (duration) return duration;
    } catch {
      // Ignore bounded non-JSON status lines.
    }
    const numeric = positiveDuration(text);
    if (numeric) return numeric;
    const formatted = parseDurationString(text);
    if (formatted) return formatted;
  }
  return null;
}

function selectedTimestamps(
  durationSeconds,
  maxFrames,
  mode = 'sampled',
  debugTimestamps = [],
) {
  const duration = Number(durationSeconds);
  const count = Math.max(1, Math.min(60, Math.round(Number(maxFrames) || 12)));
  if (!Number.isFinite(duration) || duration <= 1) return [];

  const lastSecond = Math.max(1, Math.floor(duration - 1));
  const debugValues = (Array.isArray(debugTimestamps) ? debugTimestamps : [])
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= lastSecond);
  if (debugValues.length) return [...new Set(debugValues)].slice(0, count);

  if (
    String(mode || '').toLowerCase() === 'dense_1fps' &&
    count >= lastSecond
  ) {
    return Array.from({ length: lastSecond }, (_, index) => index + 1);
  }

  const values = [];
  const seen = new Set();
  const add = (value) => {
    const second = Math.round(Number(value));
    if (!Number.isFinite(second) || second < 1 || second > lastSecond) return;
    if (seen.has(second)) return;
    seen.add(second);
    values.push(second);
  };

  // Scan both edges before the middle. Food review videos commonly show the
  // venue card in the opening seconds or at the very end, and a global timeout
  // should not prevent the end burst from being attempted.
  const edgeBudget = Math.min(count, Math.max(2, Math.ceil(count * 0.6)));
  const startBurstCount = Math.ceil(edgeBudget / 2);
  const endBurstCount = edgeBudget - startBurstCount;
  for (let second = 1; second <= startBurstCount; second += 1) add(second);
  for (let offset = 0; offset < endBurstCount; offset += 1) {
    add(lastSecond - offset);
  }

  const remaining = count - values.length;
  if (remaining > 0) {
    const low = Math.min(lastSecond, startBurstCount + 1);
    const high = Math.max(1, lastSecond - endBurstCount);
    for (let index = 0; index < remaining && low <= high; index += 1) {
      const ratio = (index + 1) / (remaining + 1);
      add(Math.round(low + (high - low) * ratio));
    }
  }

  for (let second = 1; values.length < count && second <= lastSecond; second += 1) {
    add(second);
  }

  return values.slice(0, count);
}

function canonicalYouTubeUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function safeResult({
  status,
  videoId = null,
  metadataDurationSeconds = null,
  durationSeconds = null,
  durationSource = "unavailable",
  frameScanSkippedReason = null,
  frames = [],
  warnings = [],
  binaries = {},
  maxFrames = 12,
  frameScanMode = 'sampled',
}) {
  const boundedWarnings = warningCodes(warnings);
  if (Array.isArray(warnings)) {
    warnings.splice(0, warnings.length, ...boundedWarnings);
  }
  return {
    status,
    videoId,
    metadataDurationSeconds:
      Number.isFinite(Number(metadataDurationSeconds)) &&
      Number(metadataDurationSeconds) > 0
        ? roundNumber(metadataDurationSeconds)
        : null,
    durationSeconds:
      Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0
        ? roundNumber(durationSeconds)
        : null,
    durationSource: ["metadata", "ffprobe"].includes(durationSource)
      ? durationSource
      : "unavailable",
    frameScanSkippedReason: /^[a-z0-9_]{2,100}$/.test(
      String(frameScanSkippedReason || ""),
    )
      ? String(frameScanSkippedReason)
      : null,
    frameScanMode: ['sampled', 'dense_1fps'].includes(String(frameScanMode || '').toLowerCase())
      ? String(frameScanMode).toLowerCase()
      : 'sampled',
    frames: (Array.isArray(frames) ? frames : [])
      .filter((frame) => Buffer.isBuffer(frame?.buffer))
      .slice(0, Math.max(1, Math.min(60, Math.round(Number(maxFrames) || 8))))
      .map((frame) => ({
        timestampSeconds: roundNumber(frame.timestampSeconds),
        buffer: frame.buffer,
        mimetype: "image/jpeg",
        byteLength: frame.buffer.length,
      })),
    warnings: Array.isArray(warnings) ? warnings : boundedWarnings,
    binaries: {
      ytDlpAvailable: binaries.ytDlpAvailable === true,
      ffmpegAvailable: binaries.ffmpegAvailable === true,
      ffprobeAvailable: binaries.ffprobeAvailable === true,
    },
  };
}

export async function extractYouTubeFrames(
  {
    url = "",
    videoId = null,
    maxFrames = 12,
    maxDurationSeconds = 180,
    timeoutMs = 180_000,
    downloadTimeoutMs = 180_000,
    tempDir = "",
    mode = 'sampled',
    debugTimestamps = [],
  } = {},
  {
    runCommand = defaultRunCommand,
    makeDirectory = mkdir,
    makeTempDirectory = mkdtemp,
    listDirectory = readdir,
    readFrameFile = readFile,
    removeDirectory = rm,
    statFile = stat,
    systemTempDirectory = os.tmpdir,
  } = {},
) {
  const resolvedVideoId =
    parseYouTubeVideoId(url) ||
    (/^[A-Za-z0-9_-]{11}$/.test(String(videoId || "").trim())
      ? String(videoId).trim()
      : null);
  if (!resolvedVideoId) {
    return safeResult({
      status: "skipped",
      warnings: ["youtube_frame_scan_not_youtube"],
    });
  }

  const frameScanMode = String(mode || 'sampled').trim().toLowerCase() === 'dense_1fps'
    ? 'dense_1fps'
    : 'sampled';
  const boundedMaxFrames = boundedInteger(maxFrames, 12, 1, 60);
  const boundedMaxDuration = boundedInteger(maxDurationSeconds, 180, 1, 600);
  const boundedTimeout = boundedInteger(timeoutMs, 180_000, 500, 180_000);
  const boundedDownloadTimeout = boundedInteger(
    downloadTimeoutMs,
    120_000,
    5_000,
    180_000,
  );
  const shortCommandTimeout = Math.min(10_000, boundedTimeout);
  const frameCommandTimeout = Math.min(15_000, boundedTimeout);

  const warnings = [];
  const frames = [];
  let durationSeconds = null;
  let metadataDurationSeconds = null;
  let durationSource = "unavailable";
  let temporaryDirectory = null;
  let status = "failed";
  let binaries = {
    ytDlpAvailable: false,
    ffmpegAvailable: false,
    ffprobeAvailable: false,
  };

  try {
    const binaryStatus = await checkYouTubeFrameScanBinaries(
      { timeoutMs: Math.min(2_000, shortCommandTimeout) },
      { runCommand },
    );
    binaries = binaryStatus;
    if (binaryStatus.timedOut) {
      warnings.push("youtube_frame_scan_timeout");
      return safeResult({
        status,
        videoId: resolvedVideoId,
        warnings,
        binaries,
        maxFrames: boundedMaxFrames,
        frameScanMode,
      });
    }
    if (!binaryStatus.ytDlpAvailable || !binaryStatus.ffmpegAvailable) {
      warnings.push("youtube_frame_scan_binary_missing");
      return safeResult({
        status,
        videoId: resolvedVideoId,
        warnings,
        binaries,
        maxFrames: boundedMaxFrames,
        frameScanMode,
      });
    }

    const targetUrl = canonicalYouTubeUrl(resolvedVideoId);
    let durationResult;
    try {
      durationResult = await runCommand(
        YT_DLP_BIN,
        [
          "--skip-download",
          "--no-playlist",
          "--no-warnings",
          "--print",
          "%(duration)s",
          targetUrl,
        ],
        { timeoutMs: boundedDownloadTimeout },
      );
    } catch (error) {
      if (timedOut(error)) {
        warnings.push("youtube_frame_scan_timeout");
        return safeResult({
          status,
          videoId: resolvedVideoId,
          warnings,
          binaries,
        });
      }
      warnings.push("youtube_metadata_duration_unavailable");
    }

    metadataDurationSeconds = parseDuration(durationResult?.stdout);
    durationSeconds = metadataDurationSeconds;
    if (durationSeconds) durationSource = "metadata";
    else if (!warnings.includes("youtube_metadata_duration_unavailable")) {
      warnings.push("youtube_metadata_duration_unavailable");
    }
    if (durationSeconds > boundedMaxDuration) {
      warnings.push("youtube_frame_scan_duration_exceeded");
      warnings.push("youtube_frame_scan_skipped_duration_too_long");
      return safeResult({
        status: "skipped",
        videoId: resolvedVideoId,
        metadataDurationSeconds,
        durationSeconds,
        durationSource,
        frameScanSkippedReason: "youtube_frame_scan_skipped_duration_too_long",
        warnings,
        binaries,
        maxFrames: boundedMaxFrames,
        frameScanMode,
      });
    }

    const requestedTempRoot = String(tempDir || "").trim();
    const tempRoot = requestedTempRoot
      ? path.resolve(requestedTempRoot)
      : systemTempDirectory();
    await makeDirectory(tempRoot, { recursive: true });
    temporaryDirectory = await makeTempDirectory(
      path.join(tempRoot, "foodstory-youtube-frame-"),
    );

    try {
      await runCommand(
        YT_DLP_BIN,
        [
          "--no-playlist",
          "--max-filesize",
          `${Math.floor(MAX_VIDEO_BYTES / 1024 / 1024)}M`,
          "-f",
          "bv*[height<=720][ext=mp4]/bv*[height<=720]/best[height<=720]/best",
          "-o",
          path.join(temporaryDirectory, "video.%(ext)s"),
          targetUrl,
        ],
        { timeoutMs: boundedDownloadTimeout },
      );
    } catch (error) {
      if (process.env.VISION_AUTO_LOG_YTDLP_ERRORS === 'true') {
        console.error('[youtube_frame_scan_download_failed]', {
          message: error?.message,
          code: error?.code,
          stdout: String(error?.stdout || '').slice(0, 2_000),
          stderr: String(error?.stderr || '').slice(0, 2_000),
        });
      }
      warnings.push(
        timedOut(error)
          ? "youtube_frame_scan_timeout"
          : "youtube_frame_scan_download_failed",
      );
      return safeResult({
        status,
        videoId: resolvedVideoId,
        metadataDurationSeconds,
        durationSeconds,
        durationSource,
        warnings,
        binaries,
        maxFrames: boundedMaxFrames,
        frameScanMode,
      });
    }

    const downloadedFiles = await listDirectory(temporaryDirectory);
    const videoFileName = downloadedFiles.find(
      (fileName) =>
        /^video\./i.test(String(fileName || "")) &&
        !/\.(?:part|ytdl)$/i.test(String(fileName || "")),
    );
    if (!videoFileName) {
      warnings.push("youtube_frame_scan_download_failed");
      return safeResult({
        status,
        videoId: resolvedVideoId,
        metadataDurationSeconds,
        durationSeconds,
        durationSource,
        warnings,
        binaries,
        maxFrames: boundedMaxFrames,
        frameScanMode,
      });
    }
    const videoPath = path.join(temporaryDirectory, videoFileName);
    const videoStats = await statFile(videoPath);
    if (
      !videoStats?.isFile?.() ||
      Number(videoStats.size || 0) <= 0 ||
      Number(videoStats.size || 0) > MAX_VIDEO_BYTES
    ) {
      warnings.push("youtube_frame_scan_download_failed");
      return safeResult({
        status,
        videoId: resolvedVideoId,
        metadataDurationSeconds,
        durationSeconds,
        durationSource,
        warnings,
        binaries,
        maxFrames: boundedMaxFrames,
        frameScanMode,
      });
    }

    if (!durationSeconds) {
      if (binaries.ffprobeAvailable) {
        try {
          const probeResult = await runCommand(
            FFPROBE_BIN,
            [
              "-v",
              "error",
              "-show_entries",
              "format=duration",
              "-of",
              "default=noprint_wrappers=1:nokey=1",
              videoPath,
            ],
            { timeoutMs: frameCommandTimeout },
          );
          durationSeconds = parseDuration(probeResult?.stdout);
        } catch (error) {
          if (timedOut(error)) {
            warnings.push("youtube_frame_scan_timeout");
            return safeResult({
              status,
              videoId: resolvedVideoId,
              metadataDurationSeconds,
              durationSeconds,
              durationSource,
              warnings,
              binaries,
            });
          }
        }
      }

      if (durationSeconds) {
        durationSource = "ffprobe";
        warnings.push("youtube_duration_resolved_by_ffprobe");
      } else {
        warnings.push("youtube_frame_scan_duration_unavailable");
        warnings.push("youtube_frame_scan_skipped_duration_unavailable");
        return safeResult({
          status: "skipped",
          videoId: resolvedVideoId,
          metadataDurationSeconds,
          durationSeconds,
          durationSource,
          frameScanSkippedReason:
            "youtube_frame_scan_skipped_duration_unavailable",
          warnings,
          binaries,
        });
      }
    }

    if (durationSeconds > boundedMaxDuration) {
      warnings.push("youtube_frame_scan_duration_exceeded");
      warnings.push("youtube_frame_scan_skipped_duration_too_long");
      return safeResult({
        status: "skipped",
        videoId: resolvedVideoId,
        metadataDurationSeconds,
        durationSeconds,
        durationSource,
        frameScanSkippedReason: "youtube_frame_scan_skipped_duration_too_long",
        warnings,
        binaries,
        maxFrames: boundedMaxFrames,
        frameScanMode,
      });
    }

    const timestamps = selectedTimestamps(
      durationSeconds,
      boundedMaxFrames,
      frameScanMode,
      debugTimestamps,
    );
    if (!timestamps.length) {
      warnings.push("youtube_frame_scan_no_frames");
      return safeResult({
        status: "skipped",
        videoId: resolvedVideoId,
        metadataDurationSeconds,
        durationSeconds,
        durationSource,
        frameScanSkippedReason: "youtube_frame_scan_no_frames",
        warnings,
        binaries,
        maxFrames: boundedMaxFrames,
        frameScanMode,
      });
    }

    let totalFrameBytes = 0;
    for (let index = 0; index < timestamps.length; index += 1) {
      const timestampSeconds = timestamps[index];
      const framePath = path.join(
        temporaryDirectory,
        `frame-${String(index + 1).padStart(3, "0")}.jpg`,
      );
      try {
        await runCommand(
          FFMPEG_BIN,
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-ss",
            String(timestampSeconds),
            "-i",
            videoPath,
            "-frames:v",
            "1",
            "-vf",
            "scale=1280:-2:force_original_aspect_ratio=decrease",
            "-q:v",
            "3",
            "-y",
            framePath,
          ],
          { timeoutMs: frameCommandTimeout },
        );
        const frameBuffer = await readFrameFile(framePath);
        if (
          !Buffer.isBuffer(frameBuffer) ||
          frameBuffer.length === 0 ||
          frameBuffer.length > MAX_FRAME_BYTES ||
          totalFrameBytes + frameBuffer.length > MAX_TOTAL_FRAME_BYTES
        ) {
          warnings.push("youtube_frame_scan_extract_failed");
          continue;
        }
        totalFrameBytes += frameBuffer.length;
        frames.push({ timestampSeconds, buffer: frameBuffer });
      } catch (error) {
        warnings.push(
          timedOut(error)
            ? "youtube_frame_scan_timeout"
            : "youtube_frame_scan_extract_failed",
        );
        if (timedOut(error)) break;
      }
    }

    status = frames.length ? "success" : "failed";
    if (!frames.length) warnings.push("youtube_frame_scan_no_frames");
    return safeResult({
      status,
      videoId: resolvedVideoId,
      metadataDurationSeconds,
      durationSeconds,
      durationSource,
      frames,
      warnings,
      binaries,
      maxFrames: boundedMaxFrames,
      frameScanMode,
    });
  } catch (error) {
    warnings.push(
      timedOut(error)
        ? "youtube_frame_scan_timeout"
        : "youtube_frame_scan_extract_failed",
    );
    return safeResult({
      status,
      videoId: resolvedVideoId,
      metadataDurationSeconds,
      durationSeconds,
      durationSource,
      frames: [],
      warnings,
      binaries,
      maxFrames: boundedMaxFrames,
      frameScanMode,
    });
  } finally {
    if (temporaryDirectory) {
      try {
        await removeDirectory(temporaryDirectory, {
          recursive: true,
          force: true,
        });
      } catch {
        warnings.push("youtube_frame_scan_cleanup_failed");
        warnings.splice(0, warnings.length, ...warningCodes(warnings));
      }
    }
  }
}

export {
  MAX_FRAME_BYTES,
  MAX_TOTAL_FRAME_BYTES,
  MAX_VIDEO_BYTES,
  selectedTimestamps,
};

export default extractYouTubeFrames;
