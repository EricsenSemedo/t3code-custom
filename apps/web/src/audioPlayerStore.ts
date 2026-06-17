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

const PLAYBACK_RATES: readonly TtsPlaybackRate[] = [1, 1.5, 2];

function nextPlaybackRate(current: TtsPlaybackRate): TtsPlaybackRate {
  const index = PLAYBACK_RATES.indexOf(current);
  return PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length] ?? 1;
}

interface AudioPlayerState {
  status: AudioPlayerStatus;
  playingMessageId: MessageId | null;
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

export const useAudioPlayerStore = create<AudioPlayerState & AudioPlayerActions>((set) => ({
  status: "idle",
  playingMessageId: null,
  error: null,
  playbackRate: 1,
  setLoading: (id) => set({ status: "loading", playingMessageId: id, error: null }),
  setPlaying: (id) => set({ status: "playing", playingMessageId: id, error: null }),
  setIdle: () => set({ status: "idle", playingMessageId: null }),
  cyclePlaybackRate: () => {
    let next: TtsPlaybackRate = 1;
    set((state) => {
      next = nextPlaybackRate(state.playbackRate);
      return { playbackRate: next };
    });
    return next;
  },
  setError: (id, message) => set({ status: "idle", playingMessageId: id, error: message }),
}));
