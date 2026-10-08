import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";

export type SerieFactura = {
  serie: string;
  siguienteNumero: number;
};

export type VentaFacturable = {
  id: string;
  clienteNombre: string;
  clienteRuc: string;
  moneda: "PEN" | "USD";
  total: number;
  confirmadoEn: string | null;
};

export type ComprobanteFactura = {
  id: string;
  ventaId: string;
  tipo: "factura";
  serie: string;
  numero: number;
  estado: string;
  respuestaProveedor: Record<string, unknown> | null;
  enlacePdf: string | null;
  errorPublico: string | null;
  actualizadoEn: string;
  procesandoHasta: string | null;
  clienteNombre: string;
  total: number;
  moneda: "PEN" | "USD";
};

export type PaginaFacturacion = {
  empresa: { ruc: string | null } | null;
  serie: SerieFactura | null;
  ventasElegibles: VentaFacturable[];
  comprobantes: ComprobanteFactura[];
  error: string | null;
};

export async function cargarPaginaFacturacion(): Promise<PaginaFacturacion> {
  const supabase = await crearClienteSupabaseServidor();
  const [
    empresaResultado,
    serieResultado,
    ventasResultado,
    comprobantesResultado,
  ] = await Promise.all([
    supabase.from("empresa").select("ruc").maybeSingle(),
    supabase
      .from("series_comprobante")
      .select("serie, siguiente_numero")
      .eq("tipo", "factura")
      .eq("activa", true)
      .maybeSingle(),
    supabase
      .from("ventas")
      .select(
        "id, cliente_nombre, cliente_tipo_documento, cliente_numero_documento, moneda, total, confirmado_en",
      )
      .eq("estado", "confirmada")
      .eq("cliente_tipo_documento", "ruc")
      .not("cliente_numero_documento", "is", null)
      .neq("cliente_numero_documento", "")
      .order("confirmado_en", { ascending: false })
      .limit(100),
    supabase
      .from("comprobantes")
      .select(
        "id, venta_id, tipo, serie, numero, estado, respuesta_proveedor, enlace_pdf, error_publico, actualizado_en, procesando_hasta",
      )
      .eq("tipo", "factura")
      .order("creado_en", { ascending: false })
      .limit(100),
  ]);

  if (
    empresaResultado.error ||
    serieResultado.error ||
    ventasResultado.error ||
    comprobantesResultado.error
  ) {
    return {
      empresa: null,
      serie: null,
      ventasElegibles: [],
      comprobantes: [],
      error: "No se pudo cargar la información de facturación.",
    };
  }

  const ventas = ventasResultado.data ?? [];
  const idsVentaCandidatas = ventas.map((venta) => venta.id);
  const facturasCandidatas = idsVentaCandidatas.length
    ? await supabase
        .from("comprobantes")
        .select("venta_id")
        .eq("tipo", "factura")
        .in("venta_id", idsVentaCandidatas)
    : { data: [], error: null };

  if (facturasCandidatas.error) {
    return {
      empresa: null,
      serie: null,
      ventasElegibles: [],
      comprobantes: [],
      error: "No se pudo comprobar qué ventas ya tienen factura.",
    };
  }

  const ventasDeComprobantes = comprobantesResultado.data ?? [];
  const idsVentaConComprobante = new Set(
    (facturasCandidatas.data ?? []).map((comprobante) => comprobante.venta_id),
  );

  const clientes =
    ventasDeComprobantes.length > 0
      ? await supabase
          .from("ventas")
          .select("id, cliente_nombre, moneda, total")
          .in(
            "id",
            ventasDeComprobantes.map((comprobante) => comprobante.venta_id),
          )
      : { data: [], error: null };

  if (clientes.error) {
    return {
      empresa: null,
      serie: null,
      ventasElegibles: [],
      comprobantes: [],
      error: "No se pudo cargar el historial de facturación.",
    };
  }

  const ventaPorId = new Map(
    (clientes.data ?? []).map((venta) => [venta.id, venta]),
  );

  return {
    empresa: empresaResultado.data ? { ruc: empresaResultado.data.ruc } : null,
    serie: serieResultado.data
      ? {
          serie: serieResultado.data.serie,
          siguienteNumero: Number(serieResultado.data.siguiente_numero),
        }
      : null,
    ventasElegibles: ventas
      .filter((venta) => !idsVentaConComprobante.has(venta.id))
      .map((venta) => ({
        id: venta.id,
        clienteNombre: venta.cliente_nombre ?? "Cliente sin nombre",
        clienteRuc: venta.cliente_numero_documento ?? "",
        moneda: venta.moneda,
        total: Number(venta.total),
        confirmadoEn: venta.confirmado_en,
      })),
    comprobantes: ventasDeComprobantes.flatMap((comprobante) => {
      const venta = ventaPorId.get(comprobante.venta_id);
      if (!venta || comprobante.tipo !== "factura") return [];
      return [
        {
          id: comprobante.id,
          ventaId: comprobante.venta_id,
          tipo: "factura" as const,
          serie: comprobante.serie,
          numero: Number(comprobante.numero),
          estado: comprobante.estado,
          respuestaProveedor: comprobante.respuesta_proveedor,
          enlacePdf: comprobante.enlace_pdf,
          errorPublico: comprobante.error_publico,
          actualizadoEn: comprobante.actualizado_en,
          procesandoHasta: comprobante.procesando_hasta,
          clienteNombre: venta.cliente_nombre ?? "Cliente sin nombre",
          total: Number(venta.total),
          moneda: venta.moneda,
        },
      ];
    }),
    error: null,
  };
}
