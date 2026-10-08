import { obtenerConfiguracionPublicaSupabase } from "./variables";
import { crearClienteSupabaseServidor } from "./servidor";

export type PerfilActual = {
  id: string;
  nombre: string;
  rol: "administrador" | "vendedor";
  activo: boolean;
};

export async function obtenerPerfilActual(): Promise<PerfilActual | null> {
  try {
    obtenerConfiguracionPublicaSupabase();
  } catch {
    return null;
  }

  const supabase = await crearClienteSupabaseServidor();
  const { data: claims } = await supabase.auth.getClaims();
  const id = claims?.claims.sub;

  if (typeof id !== "string") return null;

  const { data: perfil, error } = await supabase
    .from("perfiles")
    .select("id, nombre, rol, activo")
    .eq("id", id)
    .maybeSingle();

  if (error || !perfil) return null;

  return {
    id: perfil.id,
    nombre: perfil.nombre,
    rol: perfil.rol,
    activo: perfil.activo,
  };
}
