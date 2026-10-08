/**
 * Pluggable export renderers.
 *
 * Adding a new output format means adding one entry to `RENDERERS` below; the
 * routes/UI read the available formats from `listExportFormats()`, so no other
 * file has to change.
 */

import * as XLSX from "xlsx";

export interface ExportColumn {
  key: string;
  header: string;
}

export type ExportCell = string | number | boolean | null | undefined;
export type ExportRow = Record<string, ExportCell>;

export interface ExportFormatMeta {
  key: string;
  label: string;
  extension: string;
  contentType: string;
  /**
   * "utf8"  -> `content` is the file text itself.
   * "base64" -> `content` is base64 of the raw bytes (binary formats).
   */
  encoding: "utf8" | "base64";
}

export interface ExportRenderer extends ExportFormatMeta {
  render: (columns: ExportColumn[], rows: ExportRow[]) => string;
}

const CSV_BOM = "\uFEFF";

/**
 * Neuter spreadsheet formula injection: Excel/Sheets execute a cell that starts
 * with `=`, `+`, `@` or a control char, so untrusted account names get prefixed
 * with a literal quote to force them to stay text.
 */
function guardFormula(value: string): string {
  return /^[=+@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: ExportCell): string {
  if (value === null || value === undefined) return "";
  const text = guardFormula(String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvRenderer: ExportRenderer = {
  key: "csv",
  label: "CSV (.csv)",
  extension: "csv",
  contentType: "text/csv; charset=utf-8",
  encoding: "utf8",
  render(columns, rows) {
    const lines = [columns.map((column) => csvCell(column.header)).join(",")];
    for (const row of rows) {
      lines.push(columns.map((column) => csvCell(row[column.key])).join(","));
    }
    // BOM so Excel detects UTF-8 and renders the Chinese headers correctly.
    return CSV_BOM + lines.join("\r\n") + "\r\n";
  },
};

const xlsxRenderer: ExportRenderer = {
  key: "xlsx",
  label: "Excel (.xlsx)",
  extension: "xlsx",
  contentType:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  encoding: "base64",
  render(columns, rows) {
    const sheet: ExportCell[][] = [columns.map((column) => column.header)];
    for (const row of rows) {
      sheet.push(columns.map((column) => row[column.key] ?? ""));
    }

    const worksheet = XLSX.utils.aoa_to_sheet(sheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Materials");
    return XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  },
};

const jsonRenderer: ExportRenderer = {
  key: "json",
  label: "JSON (.json)",
  extension: "json",
  contentType: "application/json; charset=utf-8",
  encoding: "utf8",
  render(columns, rows) {
    // The raw rows are more useful than the presentation headers for programmatic use.
    void columns;
    return JSON.stringify(rows, null, 2);
  },
};

const RENDERERS: ExportRenderer[] = [csvRenderer, xlsxRenderer, jsonRenderer];
const REGISTRY = new Map(RENDERERS.map((renderer) => [renderer.key, renderer]));

export const DEFAULT_EXPORT_FORMAT = "csv";

export function listExportFormats(): ExportFormatMeta[] {
  return RENDERERS.map(({ key, label, extension, contentType, encoding }) => ({
    key,
    label,
    extension,
    contentType,
    encoding,
  }));
}

export function getExportRenderer(format?: string | null): ExportRenderer {
  const key = (format || DEFAULT_EXPORT_FORMAT).trim().toLowerCase();
  const renderer = REGISTRY.get(key);
  if (!renderer) {
    const available = RENDERERS.map((entry) => entry.key).join(", ");
    throw new Error(`不支持的导出格式: ${format}（可用格式: ${available}）`);
  }
  return renderer;
}

export interface ExportPayload {
  filename: string;
  contentType: string;
  encoding: "utf8" | "base64";
  content: string;
}

export function buildExport(
  format: string | null | undefined,
  columns: ExportColumn[],
  rows: ExportRow[],
  basename: string
): ExportPayload {
  const renderer = getExportRenderer(format);
  return {
    filename: `${basename}.${renderer.extension}`,
    contentType: renderer.contentType,
    encoding: renderer.encoding,
    content: renderer.render(columns, rows),
  };
}
