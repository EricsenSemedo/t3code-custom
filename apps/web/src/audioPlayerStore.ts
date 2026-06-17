import { create } from "zustand";
import { type MessageId } from "@t3tools/contracts";

/**
 * Tracks which assistant message (if any) is currently being read aloud by
 * the TTS player. Audio playback itself is owned by `useTtsPlayer` (a
 * module-level singleton `<audio>` element); this store only mirrors the
 * status so any number of `MessagePlayButton` instances can render the
 * correct icon without subscribing to a DOM element.
 *
 * Kept separate from the main `useStore` because its lifecycle is
 * independent of orchestration state.
 */

export type AudioPlayerStatus = "idle" | "loading" | "playing";
export type TtsPlaybackRate = 1 | 1.5 | 2;

function nextPlaybackRate(current: TtsPlaybackRate): TtsPlaybackRate {
  switch (current) {
    case 1:
      return 1.5;
    case 1.5:
      return 2;
    case 2:
      return 1;
  }
}

interface AudioPlayerState {
  status: AudioPlayerStatus;
  playingMessageId: MessageId | null;
  errorMessageId: MessageId | null;
  error: string | null;
  playbackRate: TtsPlaybackRate;
}

interface AudioPlayerActions {
  setLoading: (id: MessageId) => void;
  setPlaying: (id: MessageId) => void;
  setIdle: () => void;
  cyclePlaybackRate: () => TtsPlaybackRate;
  /**
   * Mark playback as failed. `id` must be the message that triggered the
   * failed request — `MessagePlayButton` uses it to attribute the anchored
   * error toast to the originating button (otherwise every mounted button
   * would surface the same toast).
   */
  setError: (id: MessageId, message: string) => void;
}

export const useAudioPlayerStore = create<AudioPlayerState & AudioPlayerActions>((set, get) => ({
  status: "idle",
  playingMessageId: null,
  errorMessageId: null,
  error: null,
  playbackRate: 1,
  setLoading: (id) =>
    set({ status: "loading", playingMessageId: id, errorMessageId: null, error: null }),
  setPlaying: (id) =>
    set({ status: "playing", playingMessageId: id, errorMessageId: null, error: null }),
  setIdle: () => set({ status: "idle", playingMessageId: null, errorMessageId: null, error: null }),
  cyclePlaybackRate: () => {
    const next = nextPlaybackRate(get().playbackRate);
    set({ playbackRate: next });
    return next;
  },
  setError: (id, message) =>
    set({ status: "idle", playingMessageId: null, errorMessageId: id, error: message }),
}));
