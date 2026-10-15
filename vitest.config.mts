import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const caminho = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": caminho("./src"),
      "server-only": caminho("./tests/apoio/vazio.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/apoio/preparar-banco-teste.ts"],
    setupFiles: ["tests/apoio/ambiente-teste.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
