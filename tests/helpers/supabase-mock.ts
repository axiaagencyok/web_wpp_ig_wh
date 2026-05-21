// Mock liviano del cliente supabase-js para tests. Suficiente para verificar
// QUÉ query se intentó (table + payload), no para correr SQL real. Cuando
// hace falta DB real, se monta un proyecto de CI dedicado (ver docs/CI.md).
//
// API: createSupabaseMock({ table: { row?, error? } }).
//   - `row` se devuelve cuando el código hace .single() o .maybeSingle()
//   - `error` se propaga al `data, error` shape
//   - Cada llamada se registra en `calls` para asserts.

import { vi } from "vitest";

export interface MockTableState {
  row?: unknown;
  rows?: unknown[];
  error?: { message: string } | null;
}

export interface MockCall {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  filters: Array<{ col: string; val: unknown }>;
}

export interface SupabaseMock {
  client: {
    from: (table: string) => unknown;
    auth: { getUser: () => Promise<{ data: { user: unknown }, error: null }> };
  };
  calls: MockCall[];
  setState: (table: string, state: MockTableState) => void;
}

export function createSupabaseMock(
  initialState: Record<string, MockTableState> = {},
  authedUser: { id: string } | null = { id: "00000000-0000-0000-0000-000000000010" },
): SupabaseMock {
  const state: Record<string, MockTableState> = { ...initialState };
  const calls: MockCall[] = [];

  function from(table: string) {
    const currentCall: MockCall = { table, op: "select", filters: [] };

    const result = {
      // — Read ops —
      // select() después de update/insert/upsert/delete es solo "returning",
      // no cambia la operación primaria. currentCall.op arranca en "select"
      // (default de from()), así que un .select() inicial no cambia nada.
      select: vi.fn((_cols?: string, _opts?: unknown) => {
        return result;
      }),
      eq: vi.fn((col: string, val: unknown) => {
        currentCall.filters.push({ col, val });
        return result;
      }),
      gt: vi.fn((col: string, val: unknown) => {
        currentCall.filters.push({ col, val });
        return result;
      }),
      gte: vi.fn((col: string, val: unknown) => {
        currentCall.filters.push({ col, val });
        return result;
      }),
      in: vi.fn((col: string, val: unknown) => {
        currentCall.filters.push({ col, val });
        return result;
      }),
      order: vi.fn(() => result),
      limit: vi.fn(() => result),

      // — Mutations —
      insert: vi.fn((payload: unknown) => {
        currentCall.op = "insert";
        currentCall.payload = payload;
        calls.push({ ...currentCall });
        return result;
      }),
      update: vi.fn((payload: unknown) => {
        currentCall.op = "update";
        currentCall.payload = payload;
        return result;
      }),
      upsert: vi.fn((payload: unknown) => {
        currentCall.op = "upsert";
        currentCall.payload = payload;
        return result;
      }),
      delete: vi.fn(() => {
        currentCall.op = "delete";
        return result;
      }),

      // — Resolvers (terminales) —
      single: vi.fn(async () => {
        if (currentCall.op !== "insert") calls.push({ ...currentCall });
        const s = state[table] ?? {};
        return { data: s.row ?? null, error: s.error ?? null };
      }),
      maybeSingle: vi.fn(async () => {
        if (currentCall.op !== "insert") calls.push({ ...currentCall });
        const s = state[table] ?? {};
        return { data: s.row ?? null, error: s.error ?? null };
      }),

      // Cuando el caller hace `await query` sin .single() — devuelve array
      then: vi.fn(<T,>(onFulfilled: (v: { data: unknown[] | null; error: unknown }) => T) => {
        if (currentCall.op !== "insert") calls.push({ ...currentCall });
        const s = state[table] ?? {};
        return Promise.resolve(onFulfilled({ data: s.rows ?? null, error: s.error ?? null }));
      }),
    };

    return result;
  }

  return {
    client: {
      from,
      auth: {
        getUser: async () => ({
          data: { user: authedUser },
          error: null,
        }),
      },
    },
    calls,
    setState: (table, s) => {
      state[table] = s;
    },
  };
}
