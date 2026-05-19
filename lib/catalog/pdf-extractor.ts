import { extractText } from "unpdf";

/**
 * Extrae el texto plano de un PDF usando `unpdf` (PDF.js compilado para
 * serverless — sin referencias a APIs de browser tipo DOMMatrix).
 *
 * API pública estable: el resto del código sigue importando `extractPdfText`.
 *
 * Errores con mensajes claros para que un operador pueda diagnosticar rápido
 * sin abrir los logs internos de pdfjs:
 * - buffer vacío
 * - PDF corrupto / encabezado inválido
 * - PDF protegido por password
 * - PDF malformado
 * - PDF sin texto seleccionable (escaneado, sólo imágenes) → resultado vacío
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error("[pdf-extractor] PDF vacío: el buffer no contiene datos.");
  }

  let result: { totalPages: number; text: string };
  try {
    result = await extractText(new Uint8Array(buffer), { mergePages: true });
  } catch (err) {
    // pdfjs (que unpdf usa por dentro) tipa sus errores con `.name`. Las clases
    // no se exportan desde unpdf, así que matcheamos por nombre.
    const e = err as { name?: string; message?: string };
    if (e?.name === "InvalidPDFException") {
      throw new Error(
        `[pdf-extractor] El archivo no es un PDF válido (encabezado o estructura incorrecta): ${e.message ?? ""}`.trim()
      );
    }
    if (e?.name === "PasswordException") {
      throw new Error(
        "[pdf-extractor] PDF protegido por contraseña. Subí una versión sin password."
      );
    }
    if (e?.name === "FormatError") {
      throw new Error(
        `[pdf-extractor] PDF malformado: ${e.message ?? ""}. Intentá re-exportar el archivo desde la herramienta original.`.trim()
      );
    }
    throw err;
  }

  const text = (result.text ?? "").trim();
  if (text.length === 0) {
    throw new Error(
      "[pdf-extractor] PDF sin texto extraíble. Probablemente sea un PDF escaneado (sólo imágenes). Convertilo a PDF con OCR antes de subirlo."
    );
  }
  return text;
}
