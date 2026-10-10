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
    const errores: unknown[] = [];

    try {
      await limpiarDatosE2E(
        supabase,
        usuarios.map((usuario) => usuario.id),
        estado.empresaCreada,
        estado.identificadorE2E,
      );
    } catch (error) {
      errores.push(error);
    }

    if (!estado.empresaCreada && estado.empresaOriginal) {
      const { error } = await supabase
        .from("empresa")
        .update(estado.empresaOriginal)
        .eq("unica", true);
      if (error) {
        errores.push(new Error("No se pudo restaurar la empresa local."));
      } else {
        const { data: empresa, error: errorVerificacion } = await supabase
          .from("empresa")
          .select("nombre, actualizado_por, actualizado_en")
          .eq("unica", true)
          .maybeSingle();
        if (
          errorVerificacion ||
          !empresa ||
          empresa.nombre !== estado.empresaOriginal.nombre ||
          empresa.actualizado_por !== estado.empresaOriginal.actualizado_por ||
          empresa.actualizado_en !== estado.empresaOriginal.actualizado_en
        ) {
          errores.push(
            new Error(
              "No se pudo verificar la restauración de la empresa local.",
            ),
          );
        }
      }
    }

    for (const usuario of usuarios) {
      try {
        await borrarUsuario(supabase, usuario.id);
      } catch (error) {
        errores.push(error);
      }
    }
    if (errores.length) {
      throw new AggregateError(errores, "Falló la limpieza de datos E2E.");
    }
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
