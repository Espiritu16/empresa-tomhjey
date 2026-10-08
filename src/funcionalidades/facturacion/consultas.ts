import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";

export type TipoComprobante = "factura" | "boleta";

export type SerieComprobante = {
  tipo: TipoComprobante;
  serie: string;
  siguienteNumero: number;
};

export type VentaFacturable = {
  id: string;
  clienteNombre: string;
  clienteTipoDocumento: string | null;
  clienteNumeroDocumento: string | null;
  moneda: "PEN" | "USD";
  total: number;
  confirmadoEn: string | null;
};

export type ComprobanteFacturacion = {
  id: string;
  ventaId: string;
  tipo: TipoComprobante;
  serie: string;
  numero: number;
  estado: string;
  respuestaProveedor: Record<string, unknown> | null;
  respuestaConsultaSunat: Record<string, unknown> | null;
  enlacePdf: string | null;
  errorPublico: string | null;
  actualizadoEn: string;
  procesandoHasta: string | null;
  consultaSunatDesde: string | null;
  consultadoSunatEn: string | null;
  consultaEnProcesoHasta: string | null;
  clienteNombre: string;
  total: number;
  moneda: "PEN" | "USD";
};

export type PaginaFacturacion = {
  empresa: { ruc: string | null } | null;
  series: SerieComprobante[];
  ventasElegibles: VentaFacturable[];
  comprobantes: ComprobanteFacturacion[];
  error: string | null;
};

export async function cargarPaginaFacturacion(): Promise<PaginaFacturacion> {
  const supabase = await crearClienteSupabaseServidor();
  const [
    empresaResultado,
    seriesResultado,
    ventasResultado,
    comprobantesResultado,
  ] = await Promise.all([
    supabase.from("empresa").select("ruc").maybeSingle(),
    supabase
      .from("series_comprobante")
      .select("tipo, serie, siguiente_numero")
      .in("tipo", ["factura", "boleta"])
      .eq("activa", true),
    supabase
      .from("ventas")
      .select(
        "id, cliente_nombre, cliente_tipo_documento, cliente_numero_documento, moneda, total, confirmado_en",
      )
      .eq("estado", "confirmada")
      .order("confirmado_en", { ascending: false })
      .limit(100),
    supabase
      .from("comprobantes")
      .select(
        "id, venta_id, tipo, serie, numero, estado, respuesta_proveedor, respuesta_consulta_sunat, enlace_pdf, error_publico, actualizado_en, procesando_hasta, consulta_sunat_desde, consultado_sunat_en, consulta_en_proceso_hasta",
      )
      .order("creado_en", { ascending: false })
      .limit(100),
  ]);

  if (
    empresaResultado.error ||
    seriesResultado.error ||
    ventasResultado.error ||
    comprobantesResultado.error
  ) {
    return {
      empresa: null,
      series: [],
      ventasElegibles: [],
      comprobantes: [],
      error: "No se pudo cargar la información de facturación.",
    };
  }

  const ventas = ventasResultado.data ?? [];
  const idsVentaCandidatas = ventas.map((venta) => venta.id);
  const comprobantesCandidatos = idsVentaCandidatas.length
    ? await supabase
        .from("comprobantes")
        .select("venta_id")
        .in("venta_id", idsVentaCandidatas)
    : { data: [], error: null };

  if (comprobantesCandidatos.error) {
    return {
      empresa: null,
      series: [],
      ventasElegibles: [],
      comprobantes: [],
      error: "No se pudo comprobar qué ventas ya tienen comprobante.",
    };
  }

  const ventasDeComprobantes = comprobantesResultado.data ?? [];
  const idsVentaConComprobante = new Set(
    (comprobantesCandidatos.data ?? []).map(
      (comprobante) => comprobante.venta_id,
    ),
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
      series: [],
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
    series: (seriesResultado.data ?? []).map((serie) => ({
      tipo: serie.tipo,
      serie: serie.serie,
      siguienteNumero: Number(serie.siguiente_numero),
    })),
    ventasElegibles: ventas
      .filter((venta) => !idsVentaConComprobante.has(venta.id))
      .map((venta) => ({
        id: venta.id,
        clienteNombre: venta.cliente_nombre ?? "Cliente sin nombre",
        clienteTipoDocumento: venta.cliente_tipo_documento,
        clienteNumeroDocumento: venta.cliente_numero_documento,
        moneda: venta.moneda,
        total: Number(venta.total),
        confirmadoEn: venta.confirmado_en,
      })),
    comprobantes: ventasDeComprobantes.flatMap((comprobante) => {
      const venta = ventaPorId.get(comprobante.venta_id);
      if (
        !venta ||
        (comprobante.tipo !== "factura" && comprobante.tipo !== "boleta")
      )
        return [];
      return [
        {
          id: comprobante.id,
          ventaId: comprobante.venta_id,
          tipo: comprobante.tipo,
          serie: comprobante.serie,
          numero: Number(comprobante.numero),
          estado: comprobante.estado,
          respuestaProveedor: comprobante.respuesta_proveedor,
          respuestaConsultaSunat: comprobante.respuesta_consulta_sunat,
          enlacePdf: comprobante.enlace_pdf,
          errorPublico: comprobante.error_publico,
          actualizadoEn: comprobante.actualizado_en,
          procesandoHasta: comprobante.procesando_hasta,
          consultaSunatDesde: comprobante.consulta_sunat_desde,
          consultadoSunatEn: comprobante.consultado_sunat_en,
          consultaEnProcesoHasta: comprobante.consulta_en_proceso_hasta,
          clienteNombre: venta.cliente_nombre ?? "Cliente sin nombre",
          total: Number(venta.total),
          moneda: venta.moneda,
        },
      ];
    }),
    error: null,
  };
}
