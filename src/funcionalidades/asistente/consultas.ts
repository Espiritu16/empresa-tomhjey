import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";
import { adjuntarBorradores, type MensajeConVenta } from "./ventas-chat";

export type MensajeAsistente = {
  id: string;
  rol: "usuario" | "asistente";
  contenido: string;
  creadoEn: string;
  ventaId: string | null;
  borradorVenta?: MensajeConVenta["borradorVenta"];
};

export type ConversacionAsistente = {
  id: string;
  titulo: string;
  actualizadaEn: string;
};

export async function cargarAsistente() {
  const supabase = await crearClienteSupabaseServidor();
  const { data: conversaciones, error } = await supabase
    .from("conversaciones")
    .select("id, titulo, actualizada_en")
    .order("actualizada_en", { ascending: false })
    .limit(30);
  if (error) {
    return {
      conversaciones: [],
      mensajes: [],
      conversacionActual: null,
      error: "No se pudo cargar el historial del asistente.",
    };
  }
  const primera = conversaciones?.[0];
  if (!primera)
    return {
      conversaciones: [],
      mensajes: [],
      conversacionActual: null,
      error: null,
    };
  const { data: mensajes, error: errorMensajes } = await supabase
    .from("mensajes")
    .select("id, rol, contenido, creado_en, venta_id")
    .eq("conversacion_id", primera.id)
    .order("creado_en", { ascending: true });
  if (errorMensajes) {
    return {
      conversaciones: [],
      mensajes: [],
      conversacionActual: null,
      error: "No se pudo cargar el historial del asistente.",
    };
  }
  const mensajesConVenta = await adjuntarBorradores(
    supabase,
    (mensajes ?? []).map((item) => ({
      id: item.id,
      rol: item.rol as "usuario" | "asistente",
      contenido: item.contenido,
      creadoEn: item.creado_en,
      ventaId: item.venta_id,
    })),
  );
  return {
    conversaciones: (conversaciones ?? []).map((item) => ({
      id: item.id,
      titulo: item.titulo,
      actualizadaEn: item.actualizada_en,
    })) as ConversacionAsistente[],
    mensajes: mensajesConVenta as MensajeAsistente[],
    conversacionActual: primera.id,
    error: null,
  };
}
