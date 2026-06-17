/**
 * Thin fetch wrapper for the local Kokoro-FastAPI server's OpenAI-compatible
 * TTS endpoint. Pure: no React, no store coupling, no logging side-effects.
 *
 * The server is expected to be reachable at `serverUrl` (loopback by default).
 * See ~/projects/Kokoro-FastAPI for the reference implementation.
 */

export type TtsRequest = {
  text: string;
  voice: string;
  serverUrl: string;
  signal?: AbortSignal | undefined;
};

const DEFAULT_MAX_TTS_SENTENCE_CHARS = 450;
const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, "");

function resolveSpeechEndpoint(serverUrl: string): string {
  const trimmed = stripTrailingSlash(serverUrl);
  return trimmed.endsWith("/v1") ? `${trimmed}/audio/speech` : `${trimmed}/v1/audio/speech`;
}

function splitLongSegment(segment: string, maxChars: number): string[] {
  if (segment.length <= maxChars) return [segment];

  const chunks: string[] = [];
  let remaining = segment;
  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars);
    const punctuationBoundary = Math.max(
      window.lastIndexOf(","),
      window.lastIndexOf(";"),
      window.lastIndexOf(":"),
    );
    const boundary = punctuationBoundary >= 0 ? punctuationBoundary : window.lastIndexOf(" ");
    const splitAt = boundary > maxChars * 0.5 ? boundary + 1 : maxChars;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}

/**
 * Kokoro starts noticeably faster when synthesis input is bounded. Keep chunks
 * sentence-oriented so each request has enough context to sound natural while
 * avoiding one huge blocking audio render for long assistant messages.
 */
export function splitTextForTts(text: string, maxChars = DEFAULT_MAX_TTS_SENTENCE_CHARS): string[] {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0);

  const segmenter =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? new Intl.Segmenter("en", { granularity: "sentence" })
      : null;
  const sentences = normalized.flatMap((paragraph) => {
    if (segmenter !== null) {
      return Array.from(segmenter.segment(paragraph), (segment) => segment.segment.trim()).filter(
        (segment) => segment.length > 0,
      );
    }
    return paragraph.split(/(?<=[.!?])\s+|(?<=[;:])\s+/).filter((segment) => segment.length > 0);
  });

  return sentences.flatMap((value) => splitLongSegment(value, maxChars));
}

export async function synthesizeSpeech(req: TtsRequest): Promise<Blob> {
  const endpoint = resolveSpeechEndpoint(req.serverUrl);
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "kokoro",
      input: req.text,
      voice: req.voice,
      response_format: "mp3",
      speed: 1,
      normalization_options: {
        normalize: true,
        unit_normalization: false,
        url_normalization: true,
        email_normalization: true,
        optional_pluralization_normalization: true,
        phone_normalization: true,
        replace_remaining_symbols: true,
      },
    }),
  };
  if (req.signal !== undefined) {
    init.signal = req.signal;
  }
  const res = await fetch(endpoint, init);

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new TtsServerError(res.status, res.statusText, detail);
  }

  return await res.blob();
}

export class TtsServerError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly detail: string;

  constructor(status: number, statusText: string, detail: string) {
    const trimmedDetail = detail.trim();
    const suffix = trimmedDetail.length > 0 ? `: ${trimmedDetail}` : "";
    super(`TTS server returned ${status} ${statusText}${suffix}`);
    this.name = "TtsServerError";
    this.status = status;
    this.statusText = statusText;
    this.detail = trimmedDetail;
  }
}
