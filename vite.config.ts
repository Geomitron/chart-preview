import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "dev",
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      "chart-preview": path.resolve(__dirname, "src/index.ts"),
    },
  },
});
