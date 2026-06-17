#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

export const MANAGED_SYNC_LABELS = [
  "upstream-sync",
  "automerge-safe",
  "needs-human-review",
  "agent-fix-allowed",
] as const;

const PROTECTED_PATH_PREFIXES = [
  "apps/desktop/",
  "scripts/build-desktop-artifact.ts",
  "apps/desktop/scripts/",
  "apps/desktop/package.json",
  "packages/shared/src/appBranding",
  "apps/server/src/provider/",
  "apps/server/src/codexAppServerManager.ts",
  "apps/server/src/providerManager.ts",
  "apps/server/src/wsServer.ts",
] as const;

const PROTECTED_WORKFLOW_PREFIX = ".github/workflows/release";
const SAFE_PATH_PREFIXES = [
  "apps/web/",
  "docs/",
  "README.md",
  "REMOTE.md",
  "KEYBINDINGS.md",
  "TODO.md",
  "apps/server/src/",
  "packages/contracts/",
  "packages/shared/",
  "scripts/",
] as const;

export interface SyncPolicyResult {
  readonly labels: ReadonlyArray<(typeof MANAGED_SYNC_LABELS)[number]>;
  readonly autoMergeAllowed: boolean;
  readonly humanReviewNeeded: boolean;
  readonly agentFixAllowed: boolean;
  readonly riskLevel: "low" | "high";
  readonly protectedFiles: ReadonlyArray<string>;
  readonly summary: string;
}

class SyncPolicyIoError extends Data.TaggedError("SyncPolicyIoError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

const encodeJsonString = Schema.encodeEffect(Schema.UnknownFromJsonString);

function isProtectedPath(filePath: string): boolean {
  return (
    PROTECTED_PATH_PREFIXES.some((prefix) => filePath === prefix || filePath.startsWith(prefix)) ||
    filePath.startsWith(PROTECTED_WORKFLOW_PREFIX)
  );
}

function isSafePath(filePath: string): boolean {
  return SAFE_PATH_PREFIXES.some((prefix) => filePath === prefix || filePath.startsWith(prefix));
}

export function classifySyncFiles(files: ReadonlyArray<string>): SyncPolicyResult {
  const normalizedFiles = files
    .map((file) => file.trim())
    .filter((file) => file.length > 0)
    .toSorted((left, right) => left.localeCompare(right));

  const protectedFiles = normalizedFiles.filter(isProtectedPath);
  const hasProtectedFiles = protectedFiles.length > 0;
  const allSafe = normalizedFiles.every(isSafePath);
  const humanReviewNeeded = hasProtectedFiles;
  const autoMergeAllowed = normalizedFiles.length > 0 && allSafe && !humanReviewNeeded;
  const agentFixAllowed = !humanReviewNeeded;
  const labels = [
    "upstream-sync",
    ...(autoMergeAllowed ? (["automerge-safe", "agent-fix-allowed"] as const) : []),
    ...(humanReviewNeeded ? (["needs-human-review"] as const) : []),
  ] satisfies ReadonlyArray<(typeof MANAGED_SYNC_LABELS)[number]>;

  const summary = hasProtectedFiles
    ? `Human review required; protected paths changed: ${protectedFiles.join(", ")}`
    : autoMergeAllowed
      ? "Auto-merge eligible after required checks pass."
      : "Not auto-mergeable by policy; review current changes and CI results.";

  return {
    labels,
    autoMergeAllowed,
    humanReviewNeeded,
    agentFixAllowed,
    riskLevel: humanReviewNeeded ? "high" : "low",
    protectedFiles,
    summary,
  };
}

interface CliOptions {
  readonly files: ReadonlyArray<string>;
  readonly filesFile: string | null;
  readonly githubOutput: string | null;
}

function parseArgs(argv: ReadonlyArray<string>): CliOptions {
  const files: string[] = [];
  let filesFile: string | null = null;
  let githubOutput: string | null = process.env.GITHUB_OUTPUT ?? null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === "--files-file") {
      filesFile = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--github-output") {
      githubOutput = process.env.GITHUB_OUTPUT ?? "";
      continue;
    }
    if (arg === "--github-output-file") {
      githubOutput = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    files.push(arg);
  }

  return { files, filesFile, githubOutput };
}

const readCliFiles = Effect.fn("readCliFiles")(function* (
  options: CliOptions,
): Effect.fn.Return<ReadonlyArray<string>, SyncPolicyIoError, FileSystem.FileSystem> {
  if (!options.filesFile) {
    return options.files;
  }
  const fs = yield* FileSystem.FileSystem;
  const fileContents = yield* fs.readFileString(options.filesFile).pipe(
    Effect.mapError(
      (cause) =>
        new SyncPolicyIoError({
          message: `Failed to read files list from ${options.filesFile}.`,
          cause,
        }),
    ),
  );
  return [...options.files, ...fileContents.split(/\r?\n/g)];
});

const writeGithubOutput = Effect.fn("writeGithubOutput")(function* (
  outputPath: string,
  result: SyncPolicyResult,
): Effect.fn.Return<void, SyncPolicyIoError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const lines = [
    `labels=${result.labels.join(",")}`,
    `auto_merge_allowed=${String(result.autoMergeAllowed)}`,
    `human_review_needed=${String(result.humanReviewNeeded)}`,
    `agent_fix_allowed=${String(result.agentFixAllowed)}`,
    `risk_level=${result.riskLevel}`,
    `protected_files=${result.protectedFiles.join(",")}`,
    `summary=${result.summary}`,
  ];
  yield* fs.writeFileString(outputPath, `${lines.join("\n")}\n`, { flag: "a" }).pipe(
    Effect.mapError(
      (cause) =>
        new SyncPolicyIoError({
          message: `Failed to write GitHub output to ${outputPath}.`,
          cause,
        }),
    ),
  );
});

const runCli = Effect.fn("runCli")(function* (
  argv: ReadonlyArray<string>,
): Effect.fn.Return<void, SyncPolicyIoError, FileSystem.FileSystem> {
  const options = parseArgs(argv);
  const files = yield* readCliFiles(options);
  const result = classifySyncFiles(files);
  if (options.githubOutput) {
    yield* writeGithubOutput(options.githubOutput, result);
  }
  const output = yield* encodeJsonString(result).pipe(
    Effect.mapError(
      (cause) =>
        new SyncPolicyIoError({
          message: "Failed to encode sync policy result.",
          cause,
        }),
    ),
  );
  yield* Effect.sync(() => {
    process.stdout.write(`${output}\n`);
  });
});

const isEntrypoint = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1]);

if (isEntrypoint) {
  runCli(process.argv.slice(2)).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
}
