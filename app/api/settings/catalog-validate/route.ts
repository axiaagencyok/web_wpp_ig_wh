import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCatalog } from "@/lib/google/sheets";

/**
 * POST /api/settings/catalog-validate
 * Body: { google_sheet_id: string, google_sheet_range: string }
 *
 * Hace un fetch real al Sheet con las credenciales del service account.
 * Permite al cliente probar la conexión ANTES de guardar los cambios
 * en /settings > Catálogo y productos.
 *
 * Requiere usuario logueado (sesión Supabase). No cambia nada en DB.
 */

const bodySchema = z.object({
  google_sheet_id: z.string().min(1).max(200),
  google_sheet_range: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "invalid-body", detail: (e as Error).message },
      { status: 400 }
    );
  }

  try {
    const text = await getCatalog(parsed.google_sheet_id, parsed.google_sheet_range);
    // getCatalog devuelve "El catálogo está vacío..." cuando no hay headers/rows.
    // No es un error de conexión, pero sí señalamos que no hay data.
    const isEmpty = text.startsWith("El catálogo está vacío");
    return NextResponse.json({
      ok: true,
      empty: isEmpty,
      preview_lines: text.split("\n").slice(0, 5).join("\n"),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 200 }
    );
  }
}
