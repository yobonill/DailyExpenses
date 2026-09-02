import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative assets work locally and under a GitHub Pages repository path.
  base: "./",
  server: {
    port: 42871,
    strictPort: true,
  },
  preview: {
    port: 42872,
    strictPort: true,
  },
});
