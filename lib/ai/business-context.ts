import { getCatalog } from "@/lib/google/sheets";
import type { Tenant } from "@/types/database.types";

export async function getTenantCatalog(
  tenant: Tenant,
  categoryFilter?: string
): Promise<string> {
  if (!tenant.google_sheet_id) {
    return "No hay catálogo configurado para este negocio.";
  }
  return getCatalog(tenant.google_sheet_id, tenant.google_sheet_range, categoryFilter);
}
