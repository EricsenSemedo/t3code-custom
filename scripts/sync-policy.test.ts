import { describe, expect, it } from "vitest";

import { classifySyncFiles } from "./sync-policy.ts";

describe("classifySyncFiles", () => {
  it("marks web-only syncs as auto-mergeable", () => {
    const result = classifySyncFiles(["apps/web/src/main.tsx", "docs/release.md"]);

    expect(result.autoMergeAllowed).toBe(true);
    expect(result.humanReviewNeeded).toBe(false);
    expect(result.labels).toEqual(["upstream-sync", "automerge-safe", "agent-fix-allowed"]);
    expect(result.riskLevel).toBe("low");
  });

  it("requires human review for protected desktop and release changes", () => {
    const result = classifySyncFiles([
      "apps/desktop/src/main.ts",
      ".github/workflows/release.yml",
      "apps/web/src/main.tsx",
    ]);

    expect(result.autoMergeAllowed).toBe(false);
    expect(result.humanReviewNeeded).toBe(true);
    expect(result.labels).toEqual(["upstream-sync", "needs-human-review"]);
    expect(result.protectedFiles).toEqual([
      ".github/workflows/release.yml",
      "apps/desktop/src/main.ts",
    ]);
    expect(result.riskLevel).toBe("high");
  });
});
