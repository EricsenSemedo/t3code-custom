/**
 * Module-level singleton TTS player.
 *
 * One `<audio>` element and one in-flight `AbortController` are shared across
 * the whole app — so audio survives component unmounts (scroll, virtualized
 * timeline) and a Play click on a different message stops the current one.
 *
 * `useTtsPlayer` only wires the live settings into a stable `play` function
 * for components. Status is mirrored into `useAudioPlayerStore` so any number
 * of `MessagePlayButton` instances can render the right icon without owning
 * the DOM element.
 */
import { useCallback } from "react";
import { type MessageId } from "@t3tools/contracts";
import { useSettings } from "./useSettings";
import { useAudioPlayerStore } from "~/audioPlayerStore";
import { splitTextForTts, synthesizeSpeech } from "~/lib/ttsClient";

const PREFETCH_AHEAD_CHUNKS = 2;

let audioElement: HTMLAudioElement | null = null;

interface PlaybackSession {
  readonly id: MessageId;
  readonly controller: AbortController;
  readonly chunks: string[];
  readonly chunkUrls: Array<Promise<ChunkUrlResult> | undefined>;
  readonly blobUrls: Set<string>;
}

type ChunkUrlResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly error: unknown }
  | null;

let currentSession: PlaybackSession | null = null;

function ensureAudioElement(): HTMLAudioElement {
  if (audioElement === null) {
    audioElement = new Audio();
  }
  audioElement.playbackRate = useAudioPlayerStore.getState().playbackRate;
  return audioElement;
}

function teardownSession(session: PlaybackSession | null): void {
  if (session !== null) {
    session.controller.abort();
    for (const blobUrl of session.blobUrls) {
      URL.revokeObjectURL(blobUrl);
    }
    session.blobUrls.clear();
  }
  if (audioElement !== null) {
    audioElement.pause();
    audioElement.removeAttribute("src");
    audioElement.load();
  }
}

export function stopPlayback(): void {
  teardownSession(currentSession);
  currentSession = null;
  useAudioPlayerStore.getState().setIdle();
}

export function cycleTtsPlaybackRate(): void {
  const rate = useAudioPlayerStore.getState().cyclePlaybackRate();
  if (audioElement !== null) {
    audioElement.playbackRate = rate;
  }
}

export interface PlayOptions {
  voice: string;
  serverUrl: string;
}

export async function startPlayback(
  id: MessageId,
  text: string,
  options: PlayOptions,
): Promise<void> {
  const store = useAudioPlayerStore.getState();
  if (store.playingMessageId === id && store.status !== "idle") {
    stopPlayback();
    return;
  }

  teardownSession(currentSession);
  const session: PlaybackSession = {
    id,
    controller: new AbortController(),
    chunks: splitTextForTts(text),
    chunkUrls: [],
    blobUrls: new Set(),
  };
  currentSession = session;
  store.setLoading(id);

  try {
    await playSession(session, options);
  } catch (error) {
    if (session.controller.signal.aborted || currentSession !== session) {
      // A subsequent play/stop already cleaned up; don't clobber its state.
      return;
    }
    const message = error instanceof Error ? error.message : "TTS request failed.";
    useAudioPlayerStore.getState().setError(id, message);
    throw error;
  }
}

function ensureChunkUrl(
  session: PlaybackSession,
  index: number,
  options: PlayOptions,
): Promise<ChunkUrlResult> | undefined {
  if (index >= session.chunks.length) {
    return undefined;
  }
  const existing = session.chunkUrls[index];
  if (existing !== undefined) {
    return existing;
  }

  const text = session.chunks[index];
  if (text === undefined) {
    return undefined;
  }

  const promise = synthesizeSpeech({
    text,
    voice: options.voice,
    serverUrl: options.serverUrl,
    signal: session.controller.signal,
  })
    .then((blob) => {
      if (session.controller.signal.aborted || currentSession !== session) {
        return null;
      }
      const blobUrl = URL.createObjectURL(blob);
      session.blobUrls.add(blobUrl);
      return { ok: true, url: blobUrl } as const;
    })
    .catch((error: unknown) => {
      if (session.controller.signal.aborted || currentSession !== session) {
        return null;
      }
      return { ok: false, error } as const;
    });
  session.chunkUrls[index] = promise;
  return promise;
}

function prefetchChunks(
  session: PlaybackSession,
  currentIndex: number,
  options: PlayOptions,
): void {
  for (
    let index = currentIndex;
    index < Math.min(session.chunks.length, currentIndex + PREFETCH_AHEAD_CHUNKS);
    index += 1
  ) {
    void ensureChunkUrl(session, index, options);
  }
}

async function playSession(session: PlaybackSession, options: PlayOptions): Promise<void> {
  if (session.chunks.length === 0) {
    stopPlayback();
    return;
  }

  for (let index = 0; index < session.chunks.length; index += 1) {
    prefetchChunks(session, index, options);
    const chunkResult = await ensureChunkUrl(session, index, options);
    if (chunkResult == null || currentSession !== session) {
      return;
    }
    if (!chunkResult.ok) {
      throw chunkResult.error;
    }
    const { url } = chunkResult;

    const audio = ensureAudioElement();
    audio.src = url;
    audio.playbackRate = useAudioPlayerStore.getState().playbackRate;
    try {
      await audio.play();
    } catch (error) {
      if (currentSession !== session || session.controller.signal.aborted) {
        return;
      }
      throw error;
    }
    if (currentSession !== session) {
      return;
    }
    useAudioPlayerStore.getState().setPlaying(session.id);
    await waitForAudioEnd(audio, session);
    session.blobUrls.delete(url);
    URL.revokeObjectURL(url);
  }

  if (currentSession === session) {
    currentSession = null;
    useAudioPlayerStore.getState().setIdle();
  }
}

function waitForAudioEnd(audio: HTMLAudioElement, session: PlaybackSession): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      session.controller.signal.removeEventListener("abort", onAbort);
    };
    const onEnded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Audio playback failed."));
    };
    const onAbort = () => {
      cleanup();
      resolve();
    };
    if (session.controller.signal.aborted) {
      resolve();
      return;
    }
    audio.addEventListener("ended", onEnded, { once: true });
    audio.addEventListener("error", onError, { once: true });
    session.controller.signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function useTtsPlayer() {
  const tts = useSettings((s) => s.tts);

  const play = useCallback(
    (id: MessageId, text: string) =>
      startPlayback(id, text, { voice: tts.voice, serverUrl: tts.serverUrl }),
    [tts.voice, tts.serverUrl],
  );

  return {
    cyclePlaybackRate: cycleTtsPlaybackRate,
    play,
    stop: stopPlayback,
  };
}

/** Test helper — resets the singleton between Vitest runs. */
export function __resetTtsPlayerForTests(): void {
  teardownSession(currentSession);
  currentSession = null;
  audioElement = null;
}
