import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { MessageId } from "@t3tools/contracts";
import { useAudioPlayerStore } from "~/audioPlayerStore";
import { __resetTtsPlayerForTests, startPlayback } from "./useTtsPlayer";

class Deferred<T> {
  promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (error: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

class FakeAudio {
  src = "";
  readonly play = vi.fn(async () => {
    setTimeout(() => this.dispatch("ended"), 0);
  });
  readonly pause = vi.fn();
  readonly load = vi.fn();
  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(event: string, listener: () => void) {
    const listeners = this.listeners.get(event) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  removeEventListener(event: string, listener: () => void) {
    this.listeners.get(event)?.delete(listener);
  }

  removeAttribute(name: string) {
    if (name === "src") {
      this.src = "";
    }
  }

  private dispatch(event: string) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener();
    }
  }
}

afterEach(() => {
  __resetTtsPlayerForTests();
  useAudioPlayerStore.setState({ status: "idle", playingMessageId: null, error: null });
  vi.unstubAllGlobals();
});

describe("startPlayback", () => {
  it("starts audio after the first chunk resolves without waiting for later prefetched chunks", async () => {
    const firstResponse = new Deferred<Response>();
    const secondResponse = new Deferred<Response>();
    const responseQueue = [firstResponse, secondResponse];
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const response = responseQueue.shift();
      if (response === undefined) {
        throw new Error("Unexpected fetch");
      }
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return response.promise;
    });
    const createdUrls: string[] = [];
    const fakeAudio = new FakeAudio();

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "Audio",
      vi.fn(function Audio() {
        return fakeAudio;
      }),
    );
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => {
        const url = `blob:tts-${createdUrls.length}`;
        createdUrls.push(url);
        return url;
      }),
      revokeObjectURL: vi.fn(),
    });

    const playback = startPlayback(
      MessageId.make("assistant-1"),
      `${"First chunk content ".repeat(18).trim()}. ${"Second chunk content ".repeat(18).trim()}.`,
      {
        voice: "af_bella",
        serverUrl: "http://127.0.0.1:8880",
      },
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    firstResponse.resolve(new Response(new Blob(["first"])));

    await vi.waitFor(() => expect(fakeAudio.play).toHaveBeenCalledTimes(1));
    expect(useAudioPlayerStore.getState().status).toBe("playing");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    secondResponse.resolve(new Response(new Blob(["second"])));
    await playback;
    expect(fakeAudio.play).toHaveBeenCalledTimes(2);
    expect(useAudioPlayerStore.getState().status).toBe("idle");
  });
});
