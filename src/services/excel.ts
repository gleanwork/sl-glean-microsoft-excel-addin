import type { SelectionContext, WriteRangeAction } from "../types";

const selectionPreviewRows = 25;
const selectionPreviewCols = 15;
const workbookPreviewSheets = 8;
const workbookPreviewRows = 25;
const workbookPreviewCols = 15;
const maxContextChars = 25000;

function quoteSheetName(name: string): string {
  return name.includes(" ") ? `'${name.replace(/'/g, "''")}'` : name;
}

export function formatRangeAddress(address: string): string {
  const bang = address.indexOf("!");
  return bang >= 0 ? address.slice(bang + 1) : address;
}

function matrixToMarkdownTable(text: string[][], values: unknown[][], formulas: string[][]): string {
  const rows = text.length;
  const cols = rows ? text[0].length : 0;
  if (!rows || !cols) {
    return "";
  }

  const lines: string[] = [];
  const header = Array.from({ length: cols }, (_, i) => `Col ${i + 1}`);
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);

  for (let row = 0; row < rows; row += 1) {
    const cells = Array.from({ length: cols }, (_, col) => {
      const formula = formulas[row]?.[col];
      const display = text[row]?.[col] || String(values[row]?.[col] ?? "");
      return formula ? `${display} (${formula})` : display;
    });
    lines.push(`| ${cells.map((cell) => String(cell).replace(/\|/g, "\\|")).join(" | ")} |`);
  }

  return lines.join("\n");
}

function matrixToPreviewTable(text: string[][], values: unknown[][], formulas: string[][]) {
  const rows = text.length;
  const cols = rows ? text[0].length : 0;
  const headers = Array.from({ length: cols }, (_, i) => `Col ${i + 1}`);
  const displayRows = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      const formula = formulas[row]?.[col];
      const display = text[row]?.[col] || String(values[row]?.[col] ?? "");
      return formula ? `${display} (${formula})` : display;
    }),
  );
  return { headers, rows: displayRows };
}

function isEmptyPreview(text: string[][], values: unknown[][], formulas: string[][]): boolean {
  return [text, values, formulas].every((matrix) =>
    matrix.every((row) => row.every((cell) => cell === "" || cell == null)),
  );
}

function truncateContext(contents: string): { contents: string; truncated: boolean } {
  if (contents.length <= maxContextChars) {
    return { contents, truncated: false };
  }
  return { contents: `${contents.slice(0, maxContextChars - 1)}…`, truncated: true };
}

export async function getSelectionContext(includeWorkbookFallback: boolean): Promise<SelectionContext | null> {
  if (typeof Excel === "undefined" || typeof Excel.run !== "function") {
    return null;
  }

  return Excel.run(async (context) => {
    const range = context.workbook.getSelectedRange();
    range.load(["address", "rowCount", "columnCount"]);
    await context.sync();

    const previewRows = Math.min(range.rowCount || 1, selectionPreviewRows);
    const previewCols = Math.min(range.columnCount || 1, selectionPreviewCols);
    const preview = range.getCell(0, 0).getResizedRange(previewRows - 1, previewCols - 1);
    preview.load(["text", "values", "formulas"]);
    await context.sync();

    const displayAddress = formatRangeAddress(range.address);
    const selectedTable = matrixToMarkdownTable(preview.text, preview.values, preview.formulas);
    const selectedPreviewTable = matrixToPreviewTable(preview.text, preview.values, preview.formulas);
    if (!isEmptyPreview(preview.text, preview.values, preview.formulas) || !includeWorkbookFallback) {
      const { contents, truncated } = truncateContext(selectedTable);
      return {
        address: range.address,
        displayAddress,
        rowCount: range.rowCount,
        columnCount: range.columnCount,
        contents,
        truncated,
        expandedFromWorkbook: false,
        previewRows,
        previewColumns: previewCols,
        previewLimitRows: selectionPreviewRows,
        previewLimitColumns: selectionPreviewCols,
        cappedBySelection: range.rowCount > previewRows || range.columnCount > previewCols,
        cappedByCharacters: truncated,
        previewTables: [
          {
            title: displayAddress,
            ...selectedPreviewTable,
          },
        ],
      };
    }

    const worksheets = context.workbook.worksheets;
    worksheets.load("items/name");
    await context.sync();

    const sheetPreviews = worksheets.items.slice(0, workbookPreviewSheets).map((sheet) => {
      const used = sheet.getUsedRangeOrNullObject();
      used.load(["address", "rowCount", "columnCount", "text", "values", "formulas"]);
      return { sheet, used };
    });
    await context.sync();

    const nonEmptySheetPreviews = sheetPreviews.filter(({ used }) => !used.isNullObject);
    const previewTables: SelectionContext["previewTables"] = [];
    const sections = nonEmptySheetPreviews
      .map(({ sheet, used }) => {
        const rows = Math.min(used.rowCount || 1, workbookPreviewRows);
        const cols = Math.min(used.columnCount || 1, workbookPreviewCols);
        const shownText = used.text.slice(0, rows).map((row) => row.slice(0, cols));
        const shownValues = used.values.slice(0, rows).map((row) => row.slice(0, cols));
        const shownFormulas = used.formulas.slice(0, rows).map((row) => row.slice(0, cols));
        previewTables.push({
          title: `${sheet.name} · ${formatRangeAddress(used.address)}`,
          ...matrixToPreviewTable(shownText, shownValues, shownFormulas),
        });
        return [
          `Sheet: ${sheet.name}`,
          `Used range: ${formatRangeAddress(used.address)}`,
          matrixToMarkdownTable(shownText, shownValues, shownFormulas),
        ].join("\n");
      });

    if (worksheets.items.length > workbookPreviewSheets) {
      sections.push(`...and ${worksheets.items.length - workbookPreviewSheets} more sheets not shown.`);
    }

    const { contents, truncated } = truncateContext(sections.join("\n\n"));
    return {
      address: range.address,
      displayAddress,
      rowCount: range.rowCount,
      columnCount: range.columnCount,
      contents,
      truncated,
      expandedFromWorkbook: true,
      previewRows: workbookPreviewRows,
      previewColumns: workbookPreviewCols,
      previewLimitRows: workbookPreviewRows,
      previewLimitColumns: workbookPreviewCols,
      cappedBySelection:
        nonEmptySheetPreviews.some(
          ({ used }) => used.rowCount > workbookPreviewRows || used.columnCount > workbookPreviewCols,
        ) || worksheets.items.length > workbookPreviewSheets,
      cappedByCharacters: truncated,
      workbookSheetsShown: Math.min(worksheets.items.length, workbookPreviewSheets),
      workbookSheetsTotal: worksheets.items.length,
      previewTables,
    };
  }).catch((error) => {
    console.warn("Could not read Excel selection", error);
    return null;
  });
}

function resolveTargetRange(
  context: Excel.RequestContext,
  action: WriteRangeAction,
): Excel.Range {
  const bang = action.address.indexOf("!");
  if (bang >= 0) {
    const sheetName = action.address.slice(0, bang).replace(/^'|'$/g, "");
    const address = action.address.slice(bang + 1);
    return context.workbook.worksheets.getItem(sheetName).getRange(address);
  }
  return context.workbook.worksheets.getActiveWorksheet().getRange(action.address);
}

export async function applyWriteRangeAction(action: WriteRangeAction): Promise<string> {
  return Excel.run(async (context) => {
    const matrix = action.values || action.formulas;
    if (!matrix?.length || !Array.isArray(matrix[0])) {
      throw new Error("The proposed update did not include a rectangular values or formulas matrix.");
    }
    const target = resolveTargetRange(context, action);
    const rows = matrix.length;
    const cols = matrix[0].length;
    const writeRange = target.getCell(0, 0).getResizedRange(rows - 1, cols - 1);

    if (action.values) {
      writeRange.values = action.values;
    } else if (action.formulas) {
      writeRange.formulas = action.formulas;
    }
    if (action.autofitColumns !== false) {
      writeRange.format.autofitColumns();
    }
    writeRange.load("address");
    await context.sync();
    return `${quoteSheetName(writeRange.address.split("!")[0] || "")}${writeRange.address.includes("!") ? "!" : ""}${formatRangeAddress(writeRange.address)}`;
  });
}
