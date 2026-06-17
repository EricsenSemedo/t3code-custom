import type { AssetResource, EnvironmentId } from "@t3tools/contracts";
import { useEffect, useMemo, useState } from "react";

import { readEnvironmentApi } from "~/environmentApi";
import { readEnvironmentConnection } from "~/environments/runtime";

const REFRESH_MARGIN_MS = 30_000;

interface CachedAssetUrl {
  readonly url: string;
  readonly expiresAt: number;
}

export interface AssetUrlState {
  readonly url: string | null;
  readonly error: string | null;
  readonly loading: boolean;
}

const assetUrlCache = new Map<string, CachedAssetUrl>();
const assetUrlRequests = new Map<string, Promise<CachedAssetUrl>>();

function assetCacheKey(environmentId: EnvironmentId, resource: AssetResource): string {
  return `${environmentId}:${JSON.stringify(resource)}`;
}

export async function resolveAssetUrl(
  environmentId: EnvironmentId,
  resource: AssetResource,
): Promise<CachedAssetUrl> {
  const key = assetCacheKey(environmentId, resource);
  const cached = assetUrlCache.get(key);
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached;
  }

  const inFlight = assetUrlRequests.get(key);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const api = readEnvironmentApi(environmentId);
    const connection = readEnvironmentConnection(environmentId);
    if (!api || !connection) {
      throw new Error("Environment is not connected.");
    }
    const result = await api.assets.createUrl({ resource });
    const cachedResult = {
      url: new URL(result.relativeUrl, connection.knownEnvironment.target.httpBaseUrl).toString(),
      expiresAt: result.expiresAt,
    };
    assetUrlCache.set(key, cachedResult);
    return cachedResult;
  })().finally(() => {
    assetUrlRequests.delete(key);
  });
  assetUrlRequests.set(key, request);
  return request;
}

export function useAssetUrl(environmentId: EnvironmentId, resource: AssetResource): string | null {
  return useAssetUrlState(environmentId, resource).url;
}

function assetUrlErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Media could not be loaded.";
}

export function useAssetUrlState(
  environmentId: EnvironmentId,
  resource: AssetResource,
): AssetUrlState {
  const resourceJson = JSON.stringify(resource);
  const stableResource = useMemo(() => JSON.parse(resourceJson) as AssetResource, [resourceJson]);
  const key = assetCacheKey(environmentId, stableResource);
  const [state, setState] = useState<AssetUrlState>(() => {
    const cached = assetUrlCache.get(key);
    return {
      url: cached?.url ?? null,
      error: null,
      loading: !cached,
    };
  });

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const load = () => {
      setState((current) => ({ ...current, error: null, loading: current.url === null }));
      void resolveAssetUrl(environmentId, stableResource)
        .then((result) => {
          if (cancelled) return;
          setState({ url: result.url, error: null, loading: false });
          refreshTimer = setTimeout(
            load,
            Math.max(0, result.expiresAt - Date.now() - REFRESH_MARGIN_MS),
          );
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setState({ url: null, error: assetUrlErrorMessage(error), loading: false });
          }
        });
    };
    load();

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [environmentId, key, stableResource]);

  return state;
}
