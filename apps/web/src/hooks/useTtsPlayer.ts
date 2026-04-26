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
import { synthesizeSpeech } from "~/lib/ttsClient";

let audioElement: HTMLAudioElement | null = null;
let abortController: AbortController | null = null;
let currentBlobUrl: string | null = null;

function ensureAudioElement(): HTMLAudioElement {
  if (audioElement === null) {
    audioElement = new Audio();
    audioElement.addEventListener("ended", () => {
      stopPlayback();
    });
    audioElement.addEventListener("error", () => {
      const store = useAudioPlayerStore.getState();
      // Attribute the error to whichever message was active when the audio
      // element raised it; if nothing was playing there's no button to
      // anchor a toast to, so just clear state.
      const id = store.playingMessageId;
      if (id !== null) {
        store.setError(id, "Audio playback failed.");
      } else {
        store.setIdle();
      }
      teardown();
    });
  }
  return audioElement;
}

function teardown(): void {
  if (abortController !== null) {
    abortController.abort();
    abortController = null;
  }
  if (audioElement !== null) {
    audioElement.pause();
    audioElement.removeAttribute("src");
    audioElement.load();
  }
  if (currentBlobUrl !== null) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
}

export function stopPlayback(): void {
  teardown();
  useAudioPlayerStore.getState().setIdle();
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

  teardown();
  const controller = new AbortController();
  abortController = controller;
  store.setLoading(id);

  let blob: Blob;
  try {
    blob = await synthesizeSpeech({
      text,
      voice: options.voice,
      serverUrl: options.serverUrl,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      // A subsequent play/stop already cleaned up; don't clobber its state.
      return;
    }
    abortController = null;
    const message = error instanceof Error ? error.message : "TTS request failed.";
    useAudioPlayerStore.getState().setError(id, message);
    throw error;
  }

  // If a newer call superseded us between fetch start and resolve, bail.
  if (abortController !== controller) {
    return;
  }

  const blobUrl = URL.createObjectURL(blob);
  currentBlobUrl = blobUrl;
  const audio = ensureAudioElement();
  audio.src = blobUrl;

  // Hold ownership through `audio.play()`. If we cleared `abortController`
  // before the await, a concurrent `startPlayback` could install its own
  // controller and we'd clobber its state from this call's catch branch
  // (the rejection would arrive after the new call set `loading`).
  try {
    await audio.play();
    if (abortController !== controller) {
      // Superseded while audio.play() was resolving; the newer call owns
      // the store now.
      return;
    }
    abortController = null;
    useAudioPlayerStore.getState().setPlaying(id);
  } catch (error) {
    if (abortController !== controller) {
      // Superseded — the newer call already updated the store.
      return;
    }
    abortController = null;
    teardown();
    const message = error instanceof Error ? error.message : "Audio playback failed.";
    useAudioPlayerStore.getState().setError(id, message);
    throw error;
  }
}

export function useTtsPlayer() {
  const tts = useSettings((s) => s.tts);

  const play = useCallback(
    (id: MessageId, text: string) =>
      startPlayback(id, text, { voice: tts.voice, serverUrl: tts.serverUrl }),
    [tts.voice, tts.serverUrl],
  );

  return {
    play,
    stop: stopPlayback,
  };
}

/** Test helper — resets the singleton between Vitest runs. */
export function __resetTtsPlayerForTests(): void {
  teardown();
  audioElement = null;
}
