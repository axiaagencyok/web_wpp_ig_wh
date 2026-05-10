import { google } from "googleapis";

interface RawCacheEntry {
  headers: string[];
  rows: string[][];
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
// Cacheamos las filas crudas, no el markdown formateado.
// Así distintos filtros de categoría no requieren llamadas adicionales a la API.
const rawCache = new Map<string, RawCacheEntry>();

function getAuthClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are required");
  }

  const privateKey = rawKey.replace(/\\n/g, "\n");

  return new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: privateKey },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

async function fetchRawRows(
  sheetId: string,
  range: string
): Promise<{ headers: string[]; rows: string[][] }> {
  const cacheKey = `${sheetId}::${range}`;
  const cached = rawCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { headers: cached.headers, rows: cached.rows };
  }

  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });

  const values = response.data.values;
  if (!values || values.length < 2) {
    return { headers: [], rows: [] };
  }

  const [headers, ...rows] = values as string[][];
  rawCache.set(cacheKey, { headers, rows, fetchedAt: Date.now() });
  return { headers, rows };
}

/**
 * Devuelve el catálogo como markdown table.
 * Si se pasa `categoryFilter`, filtra las filas donde la columna "Tipo"
 * contiene el texto (case-insensitive, substring). Una API call por cache window
 * sin importar cuántas categorías distintas se consulten.
 */
export async function getCatalog(
  sheetId: string,
  range: string,
  categoryFilter?: string
): Promise<string> {
  const { headers, rows } = await fetchRawRows(sheetId, range);

  if (headers.length === 0) {
    return "El catálogo está vacío o no tiene datos.";
  }

  let filteredRows = rows.filter((row) => row.some((cell) => cell?.trim()));

  if (categoryFilter?.trim()) {
    const tipoIndex = headers.findIndex((h) =>
      h.toLowerCase().includes("tipo")
    );
    if (tipoIndex >= 0) {
      const term = categoryFilter.trim().toLowerCase();
      filteredRows = filteredRows.filter((row) =>
        (row[tipoIndex] ?? "").toLowerCase().includes(term)
      );
    }
  }

  if (filteredRows.length === 0) {
    return categoryFilter
      ? `No se encontraron productos en la categoría "${categoryFilter}".`
      : "El catálogo está vacío.";
  }

  return formatAsMarkdown(headers, filteredRows);
}

function formatAsMarkdown(headers: string[], rows: string[][]): string {
  const separator = headers.map(() => "---").join(" | ");
  const headerRow = headers.join(" | ");
  const dataRows = rows.map((row) =>
    headers.map((_, i) => (row[i] ?? "").toString().trim()).join(" | ")
  );
  return [headerRow, separator, ...dataRows].join("\n");
}

export function invalidateCatalogCache(sheetId: string, range: string) {
  rawCache.delete(`${sheetId}::${range}`);
}
