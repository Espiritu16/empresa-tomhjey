import { readFile, rm } from "node:fs/promises";
import { crearClienteAdministradorLocal } from "./supabase-local";
import type { EstadoE2E } from "./preparar";
import { limpiarDatosE2E } from "./limpieza-datos";

export default async function limpiar(): Promise<void> {
  const rutaEstado = process.env.EMPRESA_TOMHJEY_E2E_ESTADO;
  if (!rutaEstado) return;

  try {
    const estado = JSON.parse(await readFile(rutaEstado, "utf8")) as EstadoE2E;
    const supabase = crearClienteAdministradorLocal();
    const usuarios = [estado.vendedor, estado.administrador];
    await limpiarDatosE2E(
      supabase,
      usuarios.map((usuario) => usuario.id),
      estado.empresaCreada,
    );
    for (const usuario of usuarios) await borrarUsuario(supabase, usuario.id);
  } finally {
    await rm(rutaEstado, { force: true });
    delete process.env.EMPRESA_TOMHJEY_E2E_ESTADO;
  }
}

async function borrarUsuario(
  supabase: ReturnType<typeof crearClienteAdministradorLocal>,
  id: string,
): Promise<void> {
  const { error: errorPerfil } = await supabase
    .from("perfiles")
    .delete()
    .eq("id", id);
  if (errorPerfil) throw new Error("No se pudo borrar un perfil temporal E2E.");

  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) throw new Error("No se pudo borrar un usuario temporal E2E.");
}
