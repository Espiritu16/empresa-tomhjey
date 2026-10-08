import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";

export type UsuarioEquipo = {
  id: string;
  nombre: string;
  rol: "administrador" | "vendedor";
  activo: boolean;
  creadoEn: string;
};

export type InvitacionEquipo = {
  id: string;
  correo: string;
  estado: string;
  expiraEn: string;
};

export async function cargarEquipo() {
  const supabase = await crearClienteSupabaseServidor();
  const [usuarios, invitaciones] = await Promise.all([
    supabase
      .from("perfiles")
      .select("id, nombre, rol, activo, creado_en")
      .order("creado_en"),
    supabase
      .from("invitaciones")
      .select("id, correo, estado, expira_en")
      .order("creado_en", { ascending: false }),
  ]);
  if (usuarios.error || invitaciones.error) {
    return {
      usuarios: [],
      invitaciones: [],
      error: "No se pudo cargar el equipo.",
    };
  }
  return {
    usuarios: (usuarios.data ?? []).map((usuario) => ({
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      activo: usuario.activo,
      creadoEn: usuario.creado_en,
    })) as UsuarioEquipo[],
    invitaciones: (invitaciones.data ?? []).map((invitacion) => ({
      id: invitacion.id,
      correo: invitacion.correo,
      estado: invitacion.estado,
      expiraEn: invitacion.expira_en,
    })) as InvitacionEquipo[],
    error: null,
  };
}
