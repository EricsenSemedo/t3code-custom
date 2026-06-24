import { useAtomValue } from "@effect/atom-react";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import type { AssetResource, EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { useMemo } from "react";

import { assetEnvironment } from "~/state/assets";
import { usePreparedConnection } from "~/state/session";

export { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";

export interface AssetUrlState {
  readonly url: string | null;
  readonly error: string | null;
  readonly loading: boolean;
}

function assetUrlErrorMessage(result: unknown): string {
  if (
    result !== null &&
    typeof result === "object" &&
    "error" in result &&
    result.error instanceof Error &&
    result.error.message.trim().length > 0
  ) {
    return result.error.message;
  }
  if (result instanceof Error && result.message.trim().length > 0) {
    return result.message;
  }
  return "Media could not be loaded.";
}

export function useAssetUrl(environmentId: EnvironmentId, resource: AssetResource): string | null {
  const preparedConnection = usePreparedConnection(environmentId);
  const result = useAtomValue(
    assetEnvironment.createUrl({
      environmentId,
      input: { resource },
    }),
  );
  if (preparedConnection._tag === "None" || result._tag !== "Success") {
    return null;
  }
  return resolveAssetUrl(preparedConnection.value.httpBaseUrl, result.value.relativeUrl);
}

export function useAssetUrlState(
  environmentId: EnvironmentId,
  resource: AssetResource,
): AssetUrlState {
  const preparedConnection = usePreparedConnection(environmentId);
  const result = useAtomValue(
    assetEnvironment.createUrl({
      environmentId,
      input: { resource },
    }),
  );

  if (preparedConnection._tag === "None") {
    return { url: null, error: null, loading: true };
  }
  if (result._tag === "Success") {
    return {
      url: resolveAssetUrl(preparedConnection.value.httpBaseUrl, result.value.relativeUrl),
      error: null,
      loading: false,
    };
  }
  if (result._tag === "Failure") {
    return { url: null, error: assetUrlErrorMessage(result), loading: false };
  }
  return { url: null, error: null, loading: true };
}

export function useAssetUrls(
  environmentId: EnvironmentId,
  resources: ReadonlyArray<AssetResource>,
): ReadonlyArray<string | null> {
  const preparedConnection = usePreparedConnection(environmentId);
  const results = useAtomValue(
    assetEnvironment.createUrls({
      environmentId,
      resources,
    }),
  );
  return useMemo(
    () =>
      preparedConnection._tag === "None"
        ? resources.map(() => null)
        : results.map((result) =>
            AsyncResult.isSuccess(result)
              ? resolveAssetUrl(preparedConnection.value.httpBaseUrl, result.value.relativeUrl)
              : null,
          ),
    [preparedConnection, resources, results],
  );
}
