import { createBrowserClient } from "@supabase/ssr";
import { obtenerConfiguracionPublicaSupabase } from "./variables";

export function crearClienteSupabase() {
  const { url, clavePublicable } = obtenerConfiguracionPublicaSupabase();
  return createBrowserClient(url, clavePublicable);
}
