import { readFile, rm } from "node:fs/promises";
import { crearClienteAdministradorLocal } from "./supabase-local";
import type { EstadoE2E } from "./preparar";

export default async function limpiar(): Promise<void> {
  const rutaEstado = process.env.EMPRESA_TOMHJEY_E2E_ESTADO;
  if (!rutaEstado) return;

  try {
    const estado = JSON.parse(await readFile(rutaEstado, "utf8")) as EstadoE2E;
    const supabase = crearClienteAdministradorLocal();
    const errores: string[] = [];

    for (const usuario of [estado.vendedor, estado.administrador]) {
      const { error: errorPerfil } = await supabase
        .from("perfiles")
        .delete()
        .eq("id", usuario.id);
      if (errorPerfil) errores.push("perfil");

      const { error } = await supabase.auth.admin.deleteUser(usuario.id);
      if (error) errores.push("usuario");
    }

    if (errores.length > 0) {
      throw new Error(
        "No se pudieron limpiar todas las cuentas temporales E2E.",
      );
    }
  } finally {
    await rm(rutaEstado, { force: true });
    delete process.env.EMPRESA_TOMHJEY_E2E_ESTADO;
  }
}
