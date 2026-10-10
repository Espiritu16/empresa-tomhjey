import type { SupabaseClient } from "@supabase/supabase-js";
import type { TipoComprobante } from "@/funcionalidades/facturacion/consultas";

export type LineaBorradorAsistente = {
  descripcion: string;
  cantidad: number;
  total: number;
};

export type BorradorVentaAsistente = {
  id: string;
  clienteNombre: string;
  clienteTipoDocumento: string | null;
  clienteNumeroDocumento: string | null;
  estado: "borrador" | "confirmada" | "descartada";
  tipoComprobante: TipoComprobante | null;
  moneda: "PEN" | "USD";
  total: number;
  lineas: LineaBorradorAsistente[];
};

export type MensajeConVenta = {
  id: string;
  rol: "usuario" | "asistente";
  contenido: string;
  creadoEn: string;
  ventaId: string | null;
  borradorVenta?: BorradorVentaAsistente;
};

export async function adjuntarBorradores(
  supabase: SupabaseClient,
  mensajes: MensajeConVenta[],
): Promise<MensajeConVenta[]> {
  const ventaIds = [
    ...new Set(
      mensajes
        .map((mensaje) => mensaje.ventaId)
        .filter((ventaId): ventaId is string => Boolean(ventaId)),
    ),
  ];
  if (!ventaIds.length) return mensajes;

  const { data: ventas, error: errorVentas } = await supabase
    .from("ventas")
    .select(
      "id, cliente_nombre, cliente_tipo_documento, cliente_numero_documento, estado, moneda, total, tipo_comprobante",
    )
    .in("id", ventaIds);
  if (errorVentas || !ventas?.length) return mensajes;

  const { data: lineas, error: errorLineas } = await supabase
    .from("lineas_venta")
    .select("venta_id, descripcion_congelada, cantidad, total")
    .in("venta_id", ventaIds);
  if (errorLineas) return mensajes;

  const lineasPorVenta = new Map<string, LineaBorradorAsistente[]>();
  for (const linea of lineas ?? []) {
    const agrupadas = lineasPorVenta.get(linea.venta_id) ?? [];
    agrupadas.push({
      descripcion: linea.descripcion_congelada,
      cantidad: Number(linea.cantidad),
      total: Number(linea.total),
    });
    lineasPorVenta.set(linea.venta_id, agrupadas);
  }

  const ventaPorId = new Map(ventas.map((venta) => [venta.id, venta]));
  return mensajes.map((mensaje) => {
    const venta = mensaje.ventaId ? ventaPorId.get(mensaje.ventaId) : null;
    if (!venta || !venta.cliente_nombre) return mensaje;
    return {
      ...mensaje,
      borradorVenta: {
        id: venta.id,
        clienteNombre: venta.cliente_nombre,
        clienteTipoDocumento: venta.cliente_tipo_documento,
        clienteNumeroDocumento: venta.cliente_numero_documento,
        estado: venta.estado as BorradorVentaAsistente["estado"],
        tipoComprobante:
          venta.tipo_comprobante === "factura" ||
          venta.tipo_comprobante === "boleta"
            ? venta.tipo_comprobante
            : null,
        moneda: venta.moneda as BorradorVentaAsistente["moneda"],
        total: Number(venta.total),
        lineas: lineasPorVenta.get(venta.id) ?? [],
      },
    };
  });
}
