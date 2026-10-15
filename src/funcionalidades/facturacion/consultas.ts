import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";

export type TipoComprobante = "factura" | "boleta";

export type SerieComprobante = {
  tipo: TipoComprobante;
  serie: string;
  siguienteNumero: number;
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

export type DatosComprobanteImpresion = {
  tipo: TipoComprobante;
  serie: string;
  numero: number;
  cadenaQr: string | null;
  fecha: string;
  clienteNombre: string;
  clienteTipoDocumento: string | null;
  clienteNumeroDocumento: string | null;
  clienteDireccion: string | null;
  moneda: "PEN" | "USD";
  subtotal: number;
  igv: number;
  total: number;
  lineas: {
    descripcion: string;
    sku: string;
    unidadMedida: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
  }[];
};

export type PaginaFacturacion = {
  empresa: { ruc: string | null } | null;
  series: SerieComprobante[];
  comprobantes: ComprobanteFacturacion[];
  error: string | null;
};

export async function cargarPaginaFacturacion(): Promise<PaginaFacturacion> {
  const supabase = await crearClienteSupabaseServidor();
  const [empresaResultado, seriesResultado, comprobantesResultado] =
    await Promise.all([
      supabase.from("empresa").select("ruc").maybeSingle(),
      supabase
        .from("series_comprobante")
        .select("tipo, serie, siguiente_numero")
        .in("tipo", ["factura", "boleta"])
        .eq("activa", true),
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
    comprobantesResultado.error
  ) {
    return {
      empresa: null,
      series: [],
      comprobantes: [],
      error: "No se pudo cargar la información de facturación.",
    };
  }

  const ventasDeComprobantes = comprobantesResultado.data ?? [];

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

export async function cargarComprobanteImpresion(
  comprobanteId: string,
): Promise<DatosComprobanteImpresion | null> {
  const supabase = await crearClienteSupabaseServidor();
  const { data: comprobante, error: errorComprobante } = await supabase
    .from("comprobantes")
    .select("id, venta_id, tipo, serie, numero, estado, cadena_qr")
    .eq("id", comprobanteId)
    .maybeSingle();

  if (
    errorComprobante ||
    !comprobante ||
    (comprobante.tipo !== "factura" && comprobante.tipo !== "boleta") ||
    comprobante.estado !== "emitido"
  ) {
    return null;
  }

  const [
    { data: venta, error: errorVenta },
    { data: lineas, error: errorLineas },
  ] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        "cliente_nombre, cliente_tipo_documento, cliente_numero_documento, cliente_direccion, moneda, subtotal, igv, total, confirmado_en, creado_en",
      )
      .eq("id", comprobante.venta_id)
      .maybeSingle(),
    supabase
      .from("lineas_venta")
      .select(
        "descripcion_congelada, sku_congelado, unidad_medida, cantidad, precio_unitario, total",
      )
      .eq("venta_id", comprobante.venta_id)
      .order("creado_en", { ascending: true }),
  ]);

  if (
    errorVenta ||
    errorLineas ||
    !venta ||
    (venta.moneda !== "PEN" && venta.moneda !== "USD") ||
    !lineas?.length
  ) {
    return null;
  }

  return {
    tipo: comprobante.tipo,
    serie: comprobante.serie,
    numero: Number(comprobante.numero),
    cadenaQr: comprobante.cadena_qr,
    fecha: venta.confirmado_en ?? venta.creado_en,
    clienteNombre: venta.cliente_nombre ?? "Cliente sin identificar",
    clienteTipoDocumento: venta.cliente_tipo_documento,
    clienteNumeroDocumento: venta.cliente_numero_documento,
    clienteDireccion: venta.cliente_direccion,
    moneda: venta.moneda,
    subtotal: Number(venta.subtotal),
    igv: Number(venta.igv),
    total: Number(venta.total),
    lineas: lineas.map((linea) => ({
      descripcion: linea.descripcion_congelada,
      sku: linea.sku_congelado,
      unidadMedida: linea.unidad_medida,
      cantidad: Number(linea.cantidad),
      precioUnitario: Number(linea.precio_unitario),
      total: Number(linea.total),
    })),
  };
}
