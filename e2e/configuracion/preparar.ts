import { randomBytes, randomUUID } from "node:crypto";
import { chmod, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearClienteAdministradorLocal } from "./supabase-local";
import { limpiarDatosE2E } from "./limpieza-datos";

type UsuarioPrueba = {
  id: string;
  correo: string;
  clave: string;
};

type EmpresaE2E = {
  nombre: string;
  actualizado_por: string | null;
  actualizado_en: string;
};

type EstadoE2E = {
  administrador: UsuarioPrueba;
  vendedor: UsuarioPrueba;
  empresaCreada: boolean;
  empresaOriginal: EmpresaE2E | null;
  identificadorE2E: string;
};

export default async function preparar(): Promise<void> {
  const supabase = crearClienteAdministradorLocal();
  const estado: Partial<EstadoE2E> = {
    identificadorE2E: randomUUID(),
    empresaOriginal: null,
  };
  let rutaEstado: string | undefined;

  try {
    estado.administrador = await crearUsuario(supabase, "Administración E2E");
    estado.vendedor = await crearUsuario(supabase, "Vendedor E2E");

    const { error } = await supabase
      .from("perfiles")
      .update({ rol: "administrador" })
      .eq("id", estado.administrador.id);

    if (error) throw new Error("No se pudo preparar el rol de administrador.");

    const { data: empresa, error: errorEmpresa } = await supabase
      .from("empresa")
      .select("unica, nombre, actualizado_por, actualizado_en")
      .eq("unica", true)
      .maybeSingle();
    if (errorEmpresa) throw new Error("No se pudo revisar la empresa local.");
    estado.empresaCreada = !empresa;
    estado.empresaOriginal = empresa
      ? {
          nombre: empresa.nombre,
          actualizado_por: empresa.actualizado_por,
          actualizado_en: empresa.actualizado_en,
        }
      : null;
    if (!empresa) {
      const { error: errorInsercionEmpresa } = await supabase
        .from("empresa")
        .insert({
          nombre: "Empresa E2E",
          actualizado_por: estado.administrador.id,
        });
      if (errorInsercionEmpresa) {
        throw new Error("No se pudo preparar la empresa temporal E2E.");
      }
    }

    rutaEstado = join(tmpdir(), `empresa-tomhjey-e2e-${randomUUID()}.json`);
    await writeFile(rutaEstado, JSON.stringify(estado), { mode: 0o600 });
    await chmod(rutaEstado, 0o600);
    process.env.EMPRESA_TOMHJEY_E2E_ESTADO = rutaEstado;
  } catch (error) {
    if (rutaEstado) await rm(rutaEstado, { force: true });
    const usuarios = [estado.vendedor?.id, estado.administrador?.id].filter(
      (id): id is string => Boolean(id),
    );
    await limpiarDatosE2E(
      supabase,
      usuarios,
      estado.empresaCreada ?? false,
      estado.identificadorE2E!,
    );
    await borrarUsuario(supabase, estado.vendedor?.id);
    await borrarUsuario(supabase, estado.administrador?.id);
    throw error;
  }
}

async function crearUsuario(
  supabase: ReturnType<typeof crearClienteAdministradorLocal>,
  nombre: string,
): Promise<UsuarioPrueba> {
  const identificador = randomUUID();
  const correo = `e2e-${identificador}@example.com`;
  const clave = randomBytes(32).toString("base64url");
  const { data, error } = await supabase.auth.admin.createUser({
    email: correo,
    email_confirm: true,
    password: clave,
    user_metadata: { nombre },
  });

  if (error || !data.user) {
    throw new Error("No se pudo crear un usuario temporal en Supabase local.");
  }

  return { id: data.user.id, correo, clave };
}

async function borrarUsuario(
  supabase: ReturnType<typeof crearClienteAdministradorLocal>,
  id?: string,
): Promise<void> {
  if (!id) return;
  const { error: errorPerfil } = await supabase
    .from("perfiles")
    .delete()
    .eq("id", id);
  if (errorPerfil) {
    throw new Error("No se pudo borrar el perfil temporal E2E.");
  }

  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) throw new Error("No se pudo borrar un usuario temporal E2E.");
}

export type { EstadoE2E };
