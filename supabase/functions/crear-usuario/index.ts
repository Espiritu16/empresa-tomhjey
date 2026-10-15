/// <reference lib="deno.ns" />

import {
  clientePrivilegiado,
  autenticar,
  ErrorHttp,
  exigirAdministrador,
  exigirObjetoJson,
  preflight,
  responderJson,
  respuestaError,
} from "../_shared/http.ts";

async function atender(request: Request): Promise<Response> {
  const cors = preflight(request);
  if (cors) return cors;
  try {
    const sesion = await autenticar(request);
    exigirAdministrador(sesion);
    const cuerpo = exigirObjetoJson(await request.json().catch(() => null));
    const nombre =
      typeof cuerpo.nombre === "string" ? cuerpo.nombre.trim() : "";
    if (!nombre || nombre.length > 120) {
      throw new ErrorHttp(
        "Escribe un nombre de hasta 120 caracteres.",
        400,
        "nombre_invalido",
      );
    }

    const correo =
      typeof cuerpo.correo === "string"
        ? cuerpo.correo.trim().toLowerCase()
        : "";
    if (correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      throw new ErrorHttp("Escribe un correo válido.", 400, "correo_invalido");
    }

    const clave = typeof cuerpo.clave === "string" ? cuerpo.clave : "";
    if (clave.length < 6 || clave.length > 128) {
      throw new ErrorHttp(
        "La contraseña debe tener entre 6 y 128 caracteres.",
        400,
        "clave_invalida",
      );
    }

    const rol = cuerpo.rol;
    if (rol !== "administrador" && rol !== "vendedor") {
      throw new ErrorHttp(
        "Elige Administrador o Vendedor.",
        400,
        "rol_invalido",
      );
    }

    const admin = clientePrivilegiado();
    const { data: cuenta, error: errorCrear } =
      await admin.auth.admin.createUser({
        email: correo,
        password: clave,
        email_confirm: true,
        user_metadata: { nombre },
      });
    if (errorCrear || !cuenta.user) {
      if (errorCrear?.message.toLowerCase().includes("already registered")) {
        throw new ErrorHttp(
          "Ya existe una cuenta con ese correo.",
          409,
          "correo_registrado",
        );
      }
      throw new ErrorHttp(
        "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.",
        422,
        "usuario_no_creado",
      );
    }

    const { data: perfil, error: errorRol } = await admin
      .from("perfiles")
      .update({ nombre, rol })
      .eq("id", cuenta.user.id)
      .select("id")
      .maybeSingle();
    if (errorRol || !perfil) {
      await admin.auth.admin.deleteUser(cuenta.user.id);
      throw new ErrorHttp(
        "No se pudo guardar el rol. La cuenta no se creó; inténtalo de nuevo.",
        500,
        "rol_no_guardado",
      );
    }

    return responderJson(
      { usuarioId: cuenta.user.id, correo, nombre, rol, activo: true },
      201,
    );
  } catch (error) {
    return respuestaError(error);
  }
}

Deno.serve(atender);
