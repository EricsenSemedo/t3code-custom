import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { describe, expect, it } from "vite-plus/test";

import { applyClientSettingsPatch, mergeEnvironmentSettings } from "./useSettings";

describe("mergeEnvironmentSettings", () => {
  it("combines the selected environment's server settings with client preferences", () => {
    const serverSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [ProviderInstanceId.make("codex_remote")]: {
          driver: ProviderDriverKind.make("codex"),
          enabled: true,
        },
      },
    };
    const clientSettings = {
      ...DEFAULT_CLIENT_SETTINGS,
      favorites: [
        {
          provider: ProviderInstanceId.make("codex_remote"),
          model: "gpt-5.4",
        },
      ],
    };

    const settings = mergeEnvironmentSettings(serverSettings, clientSettings);

    expect(settings.providerInstances).toBe(serverSettings.providerInstances);
    expect(settings.favorites).toBe(clientSettings.favorites);
  });
});

describe("applyClientSettingsPatch", () => {
  it("deep-merges partial TTS patches", () => {
    const settings = {
      ...DEFAULT_CLIENT_SETTINGS,
      tts: {
        enabled: true,
        serverUrl: "http://127.0.0.1:8880",
        voice: "af_heart",
      },
    };

    expect(applyClientSettingsPatch(settings, { tts: { voice: "af_bella" } }).tts).toEqual({
      enabled: true,
      serverUrl: "http://127.0.0.1:8880",
      voice: "af_bella",
    });
  });
});
