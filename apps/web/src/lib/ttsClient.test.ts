import { describe, expect, it } from "vite-plus/test";
import { splitTextForTts } from "./ttsClient";

describe("splitTextForTts", () => {
  it("keeps short text as a single chunk", () => {
    expect(splitTextForTts("Ship it.")).toEqual(["Ship it."]);
  });

  it("groups sentence-sized chunks without exceeding the limit", () => {
    const chunks = splitTextForTts(
      "First sentence. Second sentence is a little longer. Third sentence.",
      36,
    );

    expect(chunks).toEqual([
      "First sentence.",
      "Second sentence is a little longer.",
      "Third sentence.",
    ]);
    expect(chunks.every((chunk) => chunk.length <= 36)).toBe(true);
  });

  it("splits very long segments on readable boundaries", () => {
    const chunks = splitTextForTts(
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
      24,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 24)).toBe(true);
    expect(chunks.join(" ")).toBe(
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu",
    );
  });

  it("normalizes paragraph and line whitespace", () => {
    expect(splitTextForTts("One line.\nWrapped   line.\n\nNext paragraph.", 80)).toEqual([
      "One line. Wrapped line. Next paragraph.",
    ]);
  });
});
