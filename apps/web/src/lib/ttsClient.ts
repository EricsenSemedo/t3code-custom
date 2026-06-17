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

const DEFAULT_MAX_TTS_CHUNK_CHARS = 450;
const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, "");

function splitLongSegment(segment: string, maxChars: number): string[] {
  if (segment.length <= maxChars) return [segment];

  const chunks: string[] = [];
  let remaining = segment;
  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars + 1);
    const punctuationBoundary = Math.max(
      window.lastIndexOf(","),
      window.lastIndexOf(";"),
      window.lastIndexOf(":"),
    );
    const boundary =
      punctuationBoundary >= 0
        ? punctuationBoundary
        : window.slice(0, maxChars + 1).lastIndexOf(" ");
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
 * avoiding one huge blocking WAV render for long assistant messages.
 */
export function splitTextForTts(text: string, maxChars = DEFAULT_MAX_TTS_CHUNK_CHARS): string[] {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0);

  const segments = normalized.flatMap((paragraph) =>
    paragraph.split(/(?<=[.!?])\s+|(?<=[;:])\s+/).filter((segment) => segment.length > 0),
  );

  const chunks: string[] = [];
  let current = "";
  for (const segment of segments.flatMap((value) => splitLongSegment(value, maxChars))) {
    if (current.length === 0) {
      current = segment;
      continue;
    }
    const candidate = `${current} ${segment}`;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    chunks.push(current);
    current = segment;
  }
  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

export async function synthesizeSpeech(req: TtsRequest): Promise<Blob> {
  const endpoint = `${stripTrailingSlash(req.serverUrl)}/v1/audio/speech`;
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "kokoro",
      input: req.text,
      voice: req.voice,
      response_format: "wav",
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
