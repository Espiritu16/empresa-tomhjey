import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.117.2";

export type PerfilSesion = {
  id: string;
  rol: "administrador" | "vendedor";
  activo: boolean;
};

export type SesionAutenticada = {
  cliente: SupabaseClient;
  usuarioId: string;
  perfil: PerfilSesion;
};

export class ErrorHttp extends Error {
  constructor(
    message: string,
    readonly estado: number,
    readonly codigo: string,
  ) {
    super(message);
  }
}

export function responderJson(datos: unknown, estado = 200): Response {
  return Response.json(datos, {
    status: estado,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
    },
  });
}

export function preflight(request: Request): Response | null {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, apikey, content-type, x-client-info",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (request.method !== "POST") {
    return responderJson(
      { detalle: "Método no permitido.", codigo: "metodo_no_permitido" },
      405,
    );
  }
  return null;
}

export async function autenticar(request: Request): Promise<SesionAutenticada> {
  const autorizacion = request.headers.get("Authorization");
  const token = autorizacion?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    throw new ErrorHttp(
      "Inicia sesión para continuar.",
      401,
      "sesion_requerida",
    );
  }

  const url = Deno.env.get("SUPABASE_URL");
  const clavePublica =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !clavePublica) {
    throw new ErrorHttp(
      "El servicio no está configurado.",
      503,
      "servicio_no_configurado",
    );
  }

  const cliente = createClient(url, clavePublica, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: usuarioData, error: errorUsuario } =
    await cliente.auth.getUser(token);
  if (errorUsuario || !usuarioData.user) {
    throw new ErrorHttp(
      "La sesión no es válida o venció.",
      401,
      "sesion_invalida",
    );
  }

  const { data: perfil, error: errorPerfil } = await cliente
    .from("perfiles")
    .select("id, rol, activo")
    .eq("id", usuarioData.user.id)
    .maybeSingle();
  if (errorPerfil || !perfil || !perfil.activo) {
    throw new ErrorHttp(
      "La cuenta no tiene acceso activo.",
      403,
      "cuenta_inactiva",
    );
  }

  return {
    cliente,
    usuarioId: usuarioData.user.id,
    perfil: perfil as PerfilSesion,
  };
}

export function clientePrivilegiado(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const claveServicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !claveServicio) {
    throw new ErrorHttp(
      "El servicio interno no está configurado.",
      503,
      "servicio_no_configurado",
    );
  }
  return createClient(url, claveServicio, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function exigirAdministrador(sesion: SesionAutenticada): void {
  if (sesion.perfil.rol !== "administrador") {
    throw new ErrorHttp(
      "Esta operación requiere el rol de administrador.",
      403,
      "rol_requerido",
    );
  }
}

export function respuestaError(error: unknown): Response {
  if (error instanceof ErrorHttp) {
    return responderJson(
      { detalle: error.message, codigo: error.codigo },
      error.estado,
    );
  }
  console.error(
    "Error interno de Edge Function",
    error instanceof Error ? error.name : "desconocido",
  );
  return responderJson(
    { detalle: "No se pudo completar la operación.", codigo: "error_interno" },
    500,
  );
}

export function exigirObjetoJson(valor: unknown): Record<string, unknown> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    throw new ErrorHttp(
      "El cuerpo debe ser un objeto JSON.",
      400,
      "cuerpo_invalido",
    );
  }
  return valor as Record<string, unknown>;
}
