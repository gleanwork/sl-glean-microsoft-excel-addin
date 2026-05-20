import { describe, expect, it } from "vitest";
import { buildAssistantPrompt } from "../src/services/chat";

describe("buildAssistantPrompt", () => {
  it("includes selection context and write-action instructions", () => {
    const prompt = buildAssistantPrompt("Summarize this", {
      address: "Sheet1!A1:B2",
      displayAddress: "A1:B2",
      rowCount: 2,
      columnCount: 2,
      contents: "| Col 1 | Col 2 |\n| --- | --- |\n| A | B |",
      truncated: false,
      expandedFromWorkbook: false,
      previewRows: 2,
      previewColumns: 2,
      previewLimitRows: 25,
      previewLimitColumns: 10,
      cappedBySelection: false,
      cappedByCharacters: false,
    });

    expect(prompt).toContain("Current selection: A1:B2");
    expect(prompt).toContain("<glean_action>");
    expect(prompt).toContain("User request:\nSummarize this");
  });
});
