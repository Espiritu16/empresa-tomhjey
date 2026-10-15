import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";

export type UsuarioEquipo = {
  id: string;
  nombre: string;
  correo: string | null;
  rol: "administrador" | "vendedor";
  activo: boolean;
  creadoEn: string;
};

export async function cargarEquipo() {
  const supabase = await crearClienteSupabaseServidor();
  const usuarios = await supabase
    .from("perfiles")
    .select("id, nombre, correo, rol, activo, creado_en")
    .order("creado_en");
  if (usuarios.error) {
    return {
      usuarios: [],
      error: "No se pudo cargar el equipo.",
    };
  }
  return {
    usuarios: (usuarios.data ?? []).map((usuario) => ({
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      activo: usuario.activo,
      creadoEn: usuario.creado_en,
    })) as UsuarioEquipo[],
    error: null,
  };
}
