/// <reference lib="deno.ns" />

import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  autenticar,
  ErrorHttp,
  exigirObjetoJson,
  preflight,
  responderJson,
  respuestaError,
} from "../_shared/http.ts";
import {
  analizarArgumentos,
  despacharHerramienta,
  herramientas,
} from "./herramientas.ts";
import {
  crearRespuesta,
  extraerTexto,
  type RespuestaProveedor,
} from "./proveedor.ts";

const maximoDeVueltasDeHerramienta = 3;
const maximoDeCaracteres = 4000;
const limiteHistorial = 12;

function extraerLlamadas(respuesta: RespuestaProveedor) {
  return respuesta.output.filter(
    (elemento) => elemento.type === "function_call",
  );
}

async function atender(request: Request): Promise<Response> {
  const cors = preflight(request);
  if (cors) return cors;
  try {
    const sesion = await autenticar(request);
    const cuerpo = exigirObjetoJson(await request.json().catch(() => null));
    const mensaje = cuerpo.mensaje;
    const conversacionSolicitada = cuerpo.conversacionId;
    if (
      typeof mensaje !== "string" ||
      !mensaje.trim() ||
      mensaje.length > maximoDeCaracteres
    ) {
      throw new ErrorHttp(
        `El mensaje debe tener entre 1 y ${maximoDeCaracteres} caracteres.`,
        400,
        "mensaje_invalido",
      );
    }
    if (
      conversacionSolicitada !== undefined &&
      (typeof conversacionSolicitada !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(conversacionSolicitada))
    ) {
      throw new ErrorHttp(
        "La conversación no es válida.",
        400,
        "conversacion_invalida",
      );
    }

    let conversacionId = conversacionSolicitada as string | undefined;
    if (conversacionId) {
      const { data: conversacion, error } = await sesion.cliente
        .from("conversaciones")
        .select("id")
        .eq("id", conversacionId)
        .maybeSingle();
      if (error || !conversacion)
        throw new ErrorHttp(
          "No se encontró la conversación.",
          404,
          "conversacion_no_encontrada",
        );
    } else {
      const { data: conversacion, error } = await sesion.cliente
        .from("conversaciones")
        .insert({
          usuario_id: sesion.usuarioId,
          titulo: mensaje.trim().slice(0, 80),
        })
        .select("id")
        .single();
      if (error || !conversacion)
        throw new ErrorHttp(
          "No se pudo iniciar la conversación.",
          500,
          "conversacion_no_creada",
        );
      conversacionId = conversacion.id;
    }

    const { error: errorMensaje } = await sesion.cliente
      .from("mensajes")
      .insert({
        conversacion_id: conversacionId,
        rol: "usuario",
        contenido: mensaje.trim(),
      });
    if (errorMensaje)
      throw new ErrorHttp(
        "No se pudo guardar el mensaje.",
        500,
        "mensaje_no_guardado",
      );

    const { data: historial, error: errorHistorial } = await sesion.cliente
      .from("mensajes")
      .select("rol, contenido")
      .eq("conversacion_id", conversacionId)
      .order("creado_en", { ascending: false })
      .limit(limiteHistorial);
    if (errorHistorial)
      throw new ErrorHttp(
        "No se pudo leer la conversación.",
        500,
        "historial_no_disponible",
      );

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey)
      throw new ErrorHttp(
        "El asistente todavía no está configurado.",
        503,
        "ia_no_configurada",
      );
    const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-5.6-luna";
    const entrada = (historial ?? []).reverse().map((item) => ({
      role: item.rol === "usuario" ? ("user" as const) : ("assistant" as const),
      content: item.contenido,
    }));

    let respuesta = await crearRespuesta(
      entrada,
      { apiKey, model },
      herramientas,
    );
    let vueltas = 0;
    while (true) {
      const llamadas = extraerLlamadas(respuesta);
      if (llamadas.length === 0) break;
      if (vueltas >= maximoDeVueltasDeHerramienta) {
        respuesta = await crearRespuesta(
          [
            {
              role: "user",
              content:
                "Responde con los resultados disponibles, sin solicitar más herramientas.",
            },
          ],
          { apiKey, model },
          [],
          respuesta.id,
        );
        break;
      }

      const resultados: Array<Record<string, unknown>> = [];
      for (const llamada of llamadas) {
        const nombre = llamada.name;
        const callId = llamada.call_id;
        const argumentos = llamada.arguments;
        if (
          typeof nombre !== "string" ||
          typeof callId !== "string" ||
          typeof argumentos !== "string"
        ) {
          continue;
        }
        try {
          analizarArgumentos(nombre, argumentos);
          const salida = await despacharHerramienta(
            sesion.cliente,
            nombre,
            argumentos,
          );
          resultados.push({
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify(salida),
          });
        } catch (error) {
          const detalle =
            error instanceof ErrorHttp
              ? error.message
              : "No se pudo completar esa consulta.";
          resultados.push({
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({ error: detalle }),
          });
        }
      }
      if (resultados.length === 0) break;
      respuesta = await crearRespuesta(
        resultados,
        { apiKey, model },
        herramientas,
        respuesta.id,
      );
      vueltas += 1;
    }

    const respuestaTexto = extraerTexto(respuesta);
    if (!respuestaTexto)
      throw new ErrorHttp(
        "El asistente no devolvió una respuesta de texto.",
        502,
        "respuesta_ia_vacia",
      );

    const url = Deno.env.get("SUPABASE_URL");
    const clavePrivada = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !clavePrivada)
      throw new ErrorHttp(
        "El historial del asistente no está configurado.",
        503,
        "historial_no_configurado",
      );
    const clienteInterno = createClient(url, clavePrivada, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: errorRespuesta } = await clienteInterno
      .from("mensajes")
      .insert({
        conversacion_id: conversacionId,
        rol: "asistente",
        contenido: respuestaTexto,
      });
    if (errorRespuesta)
      throw new ErrorHttp(
        "No se pudo guardar la respuesta.",
        500,
        "respuesta_no_guardada",
      );
    await clienteInterno
      .from("conversaciones")
      .update({ actualizada_en: new Date().toISOString() })
      .eq("id", conversacionId)
      .eq("usuario_id", sesion.usuarioId);

    return responderJson({ conversacionId, mensaje: respuestaTexto });
  } catch (error) {
    if (error instanceof Error && !(error instanceof ErrorHttp)) {
      console.error("Fallo del proveedor o del asistente", error.name);
      return responderJson(
        {
          detalle: "No se pudo completar la respuesta del asistente.",
          codigo: "asistente_no_disponible",
        },
        502,
      );
    }
    return respuestaError(error);
  }
}

Deno.serve(atender);
