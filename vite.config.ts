import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import pkg from "./package.json";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages project site: https://<user>.github.io/<repo>/
  base: command === "build" ? `/${pkg.name}/` : "/",
  plugins: [react()],
}));
