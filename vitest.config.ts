import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Setup de tests — corren en Node (no jsdom) porque sólo testamos handlers
// de API y código server-side. El alias `@/` matchea el `paths` del
// tsconfig.json.

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000,
    // 1 fork: los tests mockean módulos vía vi.mock y la cache del módulo
    // de Vitest hace conflict si corren en paralelo dentro del mismo
    // proceso. Trade-off: jobs CI un poco más lentos a cambio de tests
    // deterministas.
    pool: "forks",
    fileParallelism: false,
  },
});
