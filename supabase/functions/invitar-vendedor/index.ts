/// <reference lib="deno.ns" />

import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {
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
    const correo = cuerpo.correo;
    if (
      typeof correo !== "string" ||
      correo.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())
    ) {
      throw new ErrorHttp("Escribe un correo válido.", 400, "correo_invalido");
    }

    const url = Deno.env.get("SUPABASE_URL");
    const clavePrivada = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !clavePrivada)
      throw new ErrorHttp(
        "La invitación no está configurada.",
        503,
        "invitacion_no_configurada",
      );

    const { data: invitacionId, error: errorRegistro } =
      await sesion.cliente.rpc("invitar_vendedor", {
        correo_invitado: correo.trim().toLowerCase(),
      });
    if (errorRegistro) {
      throw new ErrorHttp(
        errorRegistro.message,
        errorRegistro.code === "42501" ? 403 : 422,
        "invitacion_no_guardada",
      );
    }

    const admin = createClient(url, clavePrivada, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const origen = new URL(Deno.env.get("APP_URL") ?? "http://127.0.0.1:3000");
    if (origen.hostname === "localhost") origen.hostname = "127.0.0.1";
    const { error: errorInvitacion } = await admin.auth.admin.inviteUserByEmail(
      correo.trim().toLowerCase(),
      {
        data: { nombre: correo.trim().split("@")[0] },
        redirectTo: new URL("/auth/confirm", origen).toString(),
      },
    );
    if (errorInvitacion) {
      throw new ErrorHttp(
        "No se pudo enviar la invitación. Puedes reintentar desde Usuarios.",
        422,
        "correo_no_enviado",
      );
    }

    return responderJson(
      {
        invitacionId,
        correo: correo.trim().toLowerCase(),
        estado: "pendiente",
      },
      201,
    );
  } catch (error) {
    return respuestaError(error);
  }
}

Deno.serve(atender);
