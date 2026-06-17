import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { splitTextForTts, synthesizeSpeech, TtsServerError } from "./ttsClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("splitTextForTts", () => {
  it("keeps short text as a single chunk", () => {
    expect(splitTextForTts("Ship it.")).toEqual(["Ship it."]);
  });

  it("uses sentence-sized chunks without exceeding the limit", () => {
    const chunks = splitTextForTts(
      "First sentence. Second sentence is a little longer. Third sentence.",
      36,
    );

    expect(chunks).toEqual([
      "First sentence.",
      "Second sentence is a little longer.",
      "Third sentence.",
    ]);
    expect(chunks.every((chunk) => chunk.length <= 36)).toBe(true);
  });

  it("splits very long segments on readable boundaries", () => {
    const chunks = splitTextForTts(
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
      24,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 24)).toBe(true);
    expect(chunks.join(" ")).toBe(
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
    );
  });

  it("does not exceed maxChars when punctuation is at the boundary", () => {
    const text = "abcdefghi,klmnopqrstuvwxyz";
    const chunks = splitTextForTts(text, 10);

    expect(chunks.every((chunk) => chunk.length <= 10)).toBe(true);
    expect(chunks.join("")).toBe(text);
  });

  it("normalizes paragraph and line whitespace", () => {
    expect(splitTextForTts("One line.\nWrapped   line.\n\nNext paragraph.", 80)).toEqual([
      "One line.",
      "Wrapped line.",
      "Next paragraph.",
    ]);
  });
});

describe("synthesizeSpeech", () => {
  it("requests mp3 at 1x with Kokoro normalization options", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(new Blob(["audio"], { type: "audio/mpeg" }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await synthesizeSpeech({
      text: "Hello.",
      voice: "af_bella",
      serverUrl: "http://127.0.0.1:8880/v1/",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8880/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String),
      }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({
        model: "kokoro",
        input: "Hello.",
        voice: "af_bella",
        response_format: "mp3",
        speed: 1,
        normalization_options: expect.objectContaining({
          normalize: true,
          url_normalization: true,
          replace_remaining_symbols: true,
        }),
      }),
    );
  });

  it("throws TtsServerError with response details for non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("synthesis failed", {
            status: 500,
            statusText: "Internal Server Error",
          }),
      ),
    );

    await expect(
      synthesizeSpeech({
        text: "Hello.",
        voice: "af_bella",
        serverUrl: "http://127.0.0.1:8880",
      }),
    ).rejects.toMatchObject({
      detail: "synthesis failed",
      name: "TtsServerError",
      status: 500,
      statusText: "Internal Server Error",
    } satisfies Partial<TtsServerError>);
  });

  it("forwards an AbortSignal to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(new Blob(["audio"], { type: "audio/mpeg" }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await synthesizeSpeech({
      text: "Hello.",
      voice: "af_bella",
      serverUrl: "http://127.0.0.1:8880",
      signal: controller.signal,
    });

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it("accepts server URLs with or without the /v1 suffix", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(new Blob(["audio"], { type: "audio/mpeg" }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await synthesizeSpeech({
      text: "Root URL.",
      voice: "af_bella",
      serverUrl: "http://127.0.0.1:8880",
    });
    await synthesizeSpeech({
      text: "Versioned URL.",
      voice: "af_bella",
      serverUrl: "http://127.0.0.1:8880/v1/",
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:8880/v1/audio/speech",
      "http://127.0.0.1:8880/v1/audio/speech",
    ]);
  });
});
