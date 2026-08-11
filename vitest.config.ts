import { defineConfig } from "vitest/config";
import path from "path";
import { config } from "dotenv";

config({ path: path.resolve(__dirname, ".env") });

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 20000,
    server: {
      deps: {
        // next-auth internally imports "next/server" (next-auth/lib/env.js) —
        // without inlining it, Vitest loads it via native Node resolution and
        // skips the alias below entirely.
        inline: [/next-auth/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "next/server": path.resolve(__dirname, "tests/stubs/next-server.ts"),
    },
  },
});
