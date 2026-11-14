import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // chainsig.js imports Node's crypto for chains we don't use; see src/shims/crypto.ts
      crypto: fileURLToPath(new URL("./src/shims/crypto.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
