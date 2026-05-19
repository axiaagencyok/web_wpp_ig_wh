import {
  PDFParse,
  InvalidPDFException,
  PasswordException,
  FormatError,
} from "pdf-parse";

/**
 * Extrae el texto plano de un PDF.
 *
 * Errores con mensajes claros para que un operador pueda diagnosticar
 * rápido sin abrir los logs internos de pdfjs:
 * - PDF corrupto / encabezado inválido
 * - PDF protegido por password (no soportamos password todavía)
 * - PDF sin texto seleccionable (escaneado, sólo imágenes) → resultado vacío
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error("[pdf-extractor] PDF vacío: el buffer no contiene datos.");
  }

  const parser = new PDFParse({
    data: new Uint8Array(buffer),
  });

  try {
    const result = await parser.getText();
    const text = (result.text ?? "").trim();
    if (text.length === 0) {
      throw new Error(
        "[pdf-extractor] PDF sin texto extraíble. Probablemente sea un PDF escaneado (sólo imágenes). Convertilo a PDF con OCR antes de subirlo."
      );
    }
    return text;
  } catch (err) {
    if (err instanceof InvalidPDFException) {
      throw new Error(
        `[pdf-extractor] El archivo no es un PDF válido (encabezado o estructura incorrecta): ${err.message}`
      );
    }
    if (err instanceof PasswordException) {
      throw new Error(
        "[pdf-extractor] PDF protegido por contraseña. Subí una versión sin password."
      );
    }
    if (err instanceof FormatError) {
      throw new Error(
        `[pdf-extractor] PDF malformado: ${err.message}. Intentá re-exportar el archivo desde la herramienta original.`
      );
    }
    throw err;
  } finally {
    await parser.destroy().catch(() => {
      /* swallow */
    });
  }
}
