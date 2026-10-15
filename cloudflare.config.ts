import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "empresa-tomhjey",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-12",
    compatibilityFlags: ["nodejs_compat"],
    domains: ["tomhjay.proyectoutp.com"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
    },
  }),
});
