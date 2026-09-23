import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../", "");
  const proxy = {};

  if (env.VITE_DEV_API_PROXY) proxy["/api"] = env.VITE_DEV_API_PROXY;
  if (env.VITE_DEV_WS_PROXY) proxy["/ws"] = { target: env.VITE_DEV_WS_PROXY, ws: true };

  return {
    envDir: "../",
    plugins: [react()],
    server: {
      port: 5173,
      proxy,
    },
  };
});
