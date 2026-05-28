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

  it("extracts mixed values and formulas for one writeRange action", () => {
    const parsed = parseAssistantResponse(
      '<glean_action>{"action":"writeRange","address":"I1:I3","values":[["Utilization Alert"]],"formulas":[[""],["=IF(D2>=90,\\"Critical\\",\\"\\")"],["=IF(D3>=90,\\"Critical\\",\\"\\")"]]}</glean_action>',
    );

    expect(parsed.action?.values).toEqual([["Utilization Alert"]]);
    expect(parsed.action?.formulas).toHaveLength(3);
    expect(actionDimensions(parsed.action!)).toEqual({ rows: 3, columns: 1 });
  });

  it("ignores non-rectangular matrices", () => {
    const parsed = parseAssistantResponse(
      '<glean_action>{"action":"writeRange","address":"B2:C3","values":[["A"],["B","C"]]}</glean_action>',
    );
    expect(parsed.action).toBeNull();
  });
});
