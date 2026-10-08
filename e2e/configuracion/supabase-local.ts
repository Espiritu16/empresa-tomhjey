import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ConfiguracionLocal = {
  url: string;
  claveServicio: string;
};

function leerVariablesLocales(): ConfiguracionLocal {
  let salida: string;

  try {
    salida = execFileSync("npx", ["supabase", "status", "--output", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error(
      "Supabase local no está disponible. Inicia el stack con npm run supabase:start.",
    );
  }

  const variables = Object.fromEntries(
    salida.split(/\r?\n/).flatMap((linea) => {
      const separador = linea.indexOf("=");
      if (separador < 0) return [];
      const nombre = linea.slice(0, separador);
      const valor = linea
        .slice(separador + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      return [[nombre, valor]];
    }),
  );

  const url = variables.API_URL ?? variables.SUPABASE_URL;
  const claveServicio =
    variables.SERVICE_ROLE_KEY ?? variables.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !claveServicio) {
    throw new Error(
      "La salida local de Supabase no incluye API_URL y SERVICE_ROLE_KEY.",
    );
  }

  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      "Las pruebas E2E solo pueden crear cuentas en Supabase local.",
    );
  }

  return { url, claveServicio };
}

export function crearClienteAdministradorLocal(): SupabaseClient {
  const { url, claveServicio } = leerVariablesLocales();
  return createClient(url, claveServicio, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
