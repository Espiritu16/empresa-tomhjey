import type { SupabaseClient } from "@supabase/supabase-js";
import type { TipoComprobante } from "./consultas";

export async function emitirComprobante(
  supabase: SupabaseClient,
  ventaId: string,
  tipo: TipoComprobante,
) {
  const { data, error } = await supabase.functions.invoke("facturacion", {
    body: { ventaId, tipo },
  });
  if (error) throw new Error(await leerErrorFuncion(error));
  if (!data?.comprobanteId || typeof data.estado !== "string") {
    throw new Error("NubeFacT no devolvió el estado del comprobante.");
  }
  return data as {
    comprobanteId: string;
    estado: string;
    aceptadaPorSunat: boolean | null;
    requiereReintento?: boolean;
  };
}

async function leerErrorFuncion(error: {
  message: string;
  context?: unknown;
}): Promise<string> {
  if (error.context instanceof Response) {
    try {
      const cuerpo = (await error.context.clone().json()) as {
        detalle?: string;
      };
      if (cuerpo.detalle) return cuerpo.detalle;
    } catch {
      // Usa el mensaje seguro del cliente cuando la respuesta no sea JSON.
    }
  }
  return error.message || "No se pudo enviar el comprobante a NubeFacT.";
}
