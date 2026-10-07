import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { obtenerConfiguracionPublicaSupabase } from "./variables";

export async function crearClienteSupabaseServidor() {
  const { url, clavePublicable } = obtenerConfiguracionPublicaSupabase();
  const almacenCookies = await cookies();

  return createServerClient(url, clavePublicable, {
    cookies: {
      getAll() {
        return almacenCookies.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            almacenCookies.set(name, value, options);
          });
        } catch {
          // Los Server Components pueden leer cookies, pero no escribirlas.
          // El proxy de Supabase mantiene la sesión actualizada por petición.
        }
      },
    },
  });
}
