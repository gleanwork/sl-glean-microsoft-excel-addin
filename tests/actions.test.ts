import { describe, expect, it } from "vitest";
import { actionDimensions, parseAssistantResponse } from "../src/services/actions";

describe("parseAssistantResponse", () => {
  it("returns plain text when there is no action", () => {
    expect(parseAssistantResponse("Here is an answer.")).toEqual({
      text: "Here is an answer.",
      action: null,
    });
  });

  it("extracts a valid writeRange action", () => {
    const parsed = parseAssistantResponse(
      'Filled the cells.\n<glean_action>{"action":"writeRange","address":"B2:B3","values":[["A"],["B"]]}</glean_action>',
    );
    expect(parsed.text).toBe("Filled the cells.");
    expect(parsed.action?.address).toBe("B2:B3");
    expect(actionDimensions(parsed.action!)).toEqual({ rows: 2, columns: 1 });
  });

  it("ignores non-rectangular matrices", () => {
    const parsed = parseAssistantResponse(
      '<glean_action>{"action":"writeRange","address":"B2:C3","values":[["A"],["B","C"]]}</glean_action>',
    );
    expect(parsed.action).toBeNull();
  });
});
