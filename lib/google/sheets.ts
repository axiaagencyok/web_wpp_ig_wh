import { google } from "googleapis";

interface RawCacheEntry {
  headers: string[];
  rows: string[][];
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const rawCache = new Map<string, RawCacheEntry>();

function getReadAuth() {
  return getAuthClient(["https://www.googleapis.com/auth/spreadsheets.readonly"]);
}

function getWriteAuth() {
  return getAuthClient(["https://www.googleapis.com/auth/spreadsheets"]);
}

function getAuthClient(scopes: string[]) {
  const email  = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are required");
  }

  return new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: rawKey.replace(/\\n/g, "\n") },
    scopes,
  });
}

async function fetchRawRows(sheetId: string, range: string): Promise<{ headers: string[]; rows: string[][] }> {
  const cacheKey = `${sheetId}::${range}`;
  const cached   = rawCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { headers: cached.headers, rows: cached.rows };
  }

  const sheets   = google.sheets({ version: "v4", auth: getReadAuth() });
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range });
  const values   = response.data.values;

  if (!values || values.length < 2) return { headers: [], rows: [] };

  const [headers, ...rows] = values as string[][];
  rawCache.set(cacheKey, { headers, rows, fetchedAt: Date.now() });
  return { headers, rows };
}

export async function getCatalog(sheetId: string, range: string, categoryFilter?: string): Promise<string> {
  const { headers, rows } = await fetchRawRows(sheetId, range);
  if (headers.length === 0) return "El catálogo está vacío o no tiene datos.";

  let filteredRows = rows.filter((row) => row.some((cell) => cell?.trim()));

  if (categoryFilter?.trim()) {
    const tipoIndex = headers.findIndex((h) => h.toLowerCase().includes("tipo"));
    if (tipoIndex >= 0) {
      const term = categoryFilter.trim().toLowerCase();
      filteredRows = filteredRows.filter((row) => {
        const cellValue = (row[tipoIndex] ?? "").toLowerCase();
        // Bidireccional: "licuadora" matchea "licuadoras" y viceversa
        return cellValue.includes(term) || term.includes(cellValue);
      });
    }
  }

  if (filteredRows.length === 0) {
    return categoryFilter
      ? `No se encontraron productos en la categoría "${categoryFilter}".`
      : "El catálogo está vacío.";
  }

  return formatAsMarkdown(headers, filteredRows);
}

/**
 * Búsqueda full-text en TODAS las columnas del catálogo.
 * - Divide searchTerm en palabras; una fila matchea si CUALQUIER palabra aparece en CUALQUIER celda.
 * - Matching bidireccional: cellValue.includes(term) OR term.includes(cellValue) (solo si cellValue >= 4 chars).
 * - Si 0 resultados: devuelve el catálogo completo con nota para que el modelo no se quede sin datos.
 */
export async function searchCatalogFullText(
  sheetId: string,
  range: string,
  searchTerm: string
): Promise<string> {
  const trimmed = searchTerm.trim();
  if (!trimmed) return getCatalog(sheetId, range);

  const { headers, rows } = await fetchRawRows(sheetId, range);
  if (headers.length === 0) return "El catálogo está vacío o no tiene datos.";

  const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean);

  const nonEmptyRows = rows.filter((row) => row.some((cell) => cell?.trim()));

  const filteredRows = nonEmptyRows.filter((row) =>
    terms.some((term) =>
      row.some((cell) => {
        const cellValue = (cell ?? "").toLowerCase().trim();
        if (!cellValue) return false;
        if (cellValue.includes(term)) return true;
        // Solo secundario si cellValue es suficientemente largo (evita falsos positivos con "a", "el", etc.)
        if (cellValue.length >= 4 && term.includes(cellValue)) return true;
        return false;
      })
    )
  );

  if (filteredRows.length === 0) {
    const fullCatalog = formatAsMarkdown(headers, nonEmptyRows);
    return (
      `⚠️ BÚSQUEDA SIN RESULTADO EXACTO para "${searchTerm}".\n` +
      `Revisá el catálogo completo línea por línea antes de decir que no hay productos:\n\n` +
      fullCatalog
    );
  }

  return formatAsMarkdown(headers, filteredRows);
}

// ── Write operations ─────────────────────────────────────────────────────────

/**
 * Devuelve las filas crudas con sus índices (0-based), útil para búsqueda previa a escritura.
 * NOTA: el service account necesita acceso como Editor al Sheet.
 */
export async function getRawRows(
  sheetId: string,
  range: string
): Promise<{ headers: string[]; rows: string[][] }> {
  return fetchRawRows(sheetId, range);
}

/**
 * Actualiza una celda en la fila que matchea rowMatch (substring case-insensitive en cualquier columna).
 * Devuelve el valor previo y el nuevo.
 */
export async function updateCell(
  sheetId: string,
  range: string,
  rowMatch: string,
  column: string,
  newValue: string
): Promise<{ found: boolean; previousValue: string; newValue: string; rowIndex: number }> {
  const { headers, rows } = await fetchRawRows(sheetId, range);

  const colIndex = headers.findIndex((h) => h.toLowerCase().trim() === column.toLowerCase().trim());
  if (colIndex < 0) throw new Error(`Columna "${column}" no encontrada. Columnas disponibles: ${headers.join(", ")}`);

  const rowIndex = rows.findIndex((row) =>
    row.some((cell) => cell?.toLowerCase().includes(rowMatch.toLowerCase()))
  );
  if (rowIndex < 0) throw new Error(`No se encontró ninguna fila que contenga "${rowMatch}"`);

  const previousValue = rows[rowIndex][colIndex] ?? "";

  // Calcular la celda A1 notation: range empieza en fila 1 (header), data desde fila 2
  const sheetName   = range.split("!")[0] ?? "Sheet1";
  const colLetter   = columnToLetter(colIndex);
  const spreadsheetRow = rowIndex + 2; // +1 header +1 1-based
  const cellRange   = `${sheetName}!${colLetter}${spreadsheetRow}`;

  const sheets = google.sheets({ version: "v4", auth: getWriteAuth() });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: cellRange,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[newValue]] },
  });

  // Invalidar caché
  invalidateCatalogCache(sheetId, range);

  return { found: true, previousValue, newValue, rowIndex };
}

/**
 * Agrega una fila nueva al final del rango.
 */
export async function appendRow(
  sheetId: string,
  range: string,
  rowData: Record<string, string>
): Promise<{ appendedRow: string[] }> {
  const { headers } = await fetchRawRows(sheetId, range);
  const row = headers.map((h) => rowData[h] ?? rowData[h.trim()] ?? "");

  const sheets = google.sheets({ version: "v4", auth: getWriteAuth() });
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });

  invalidateCatalogCache(sheetId, range);
  return { appendedRow: row };
}

/**
 * Elimina el contenido de una fila que matchea rowMatch (no elimina la fila, limpia las celdas).
 * Para borrado físico se necesita la Sheets API v4 batchUpdate — aquí limpiamos el contenido.
 */
export async function clearRow(
  sheetId: string,
  range: string,
  rowMatch: string
): Promise<{ found: boolean; clearedRowIndex: number }> {
  const { headers, rows } = await fetchRawRows(sheetId, range);

  const rowIndex = rows.findIndex((row) =>
    row.some((cell) => cell?.toLowerCase().includes(rowMatch.toLowerCase()))
  );
  if (rowIndex < 0) return { found: false, clearedRowIndex: -1 };

  const sheetName      = range.split("!")[0] ?? "Sheet1";
  const spreadsheetRow = rowIndex + 2;
  const lastCol        = columnToLetter(headers.length - 1);
  const clearRange     = `${sheetName}!A${spreadsheetRow}:${lastCol}${spreadsheetRow}`;

  const sheets = google.sheets({ version: "v4", auth: getWriteAuth() });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: clearRange,
  });

  invalidateCatalogCache(sheetId, range);
  return { found: true, clearedRowIndex: rowIndex };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function columnToLetter(index: number): string {
  let col = "";
  let n = index;
  while (n >= 0) {
    col = String.fromCharCode((n % 26) + 65) + col;
    n = Math.floor(n / 26) - 1;
  }
  return col;
}

function formatAsMarkdown(headers: string[], rows: string[][]): string {
  const separator = headers.map(() => "---").join(" | ");
  const headerRow = headers.join(" | ");
  const dataRows  = rows.map((row) =>
    headers.map((_, i) => (row[i] ?? "").toString().trim()).join(" | ")
  );
  return [headerRow, separator, ...dataRows].join("\n");
}

export function invalidateCatalogCache(sheetId: string, range: string) {
  rawCache.delete(`${sheetId}::${range}`);
}
