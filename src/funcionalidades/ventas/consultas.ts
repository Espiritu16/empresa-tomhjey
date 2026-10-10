import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";

export type ProductoVenta = {
  productoId: string;
  combinacionId: string | null;
  sku: string;
  descripcion: string;
  precio: number;
  unidadMedida: string;
};

export type LineaVenta = {
  id: string;
  productoId: string;
  combinacionId: string | null;
  descripcion: string;
  sku: string;
  unidadMedida: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
};

export type Venta = {
  id: string;
  clienteId: string | null;
  clienteNombre: string | null;
  clienteTipoDocumento: string | null;
  clienteNumeroDocumento: string | null;
  estado: string;
  moneda: "PEN" | "USD";
  subtotal: number;
  igv: number;
  total: number;
  creadoEn: string;
  confirmadoEn: string | null;
  creadoPor: string;
  tipoComprobante: "factura" | "boleta" | null;
  estadoComprobante: string | null;
  enlacePdf: string | null;
  lineas: LineaVenta[];
};

export type ClienteVenta = {
  id: string;
  nombre: string;
  documento: string | null;
  tipoDocumento: string | null;
};

export async function cargarVentas() {
  const supabase = await crearClienteSupabaseServidor();
  const [
    ventas,
    lineas,
    clientes,
    productos,
    combinaciones,
    valores,
    opciones,
  ] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        "id, cliente_id, cliente_nombre, cliente_tipo_documento, cliente_numero_documento, estado, moneda, subtotal, igv, total, creado_en, confirmado_en, creado_por, tipo_comprobante",
      )
      .order("creado_en", { ascending: false })
      .limit(200),
    supabase
      .from("lineas_venta")
      .select(
        "id, venta_id, producto_id, combinacion_id, descripcion_congelada, sku_congelado, unidad_medida, cantidad, precio_unitario, total",
      ),
    supabase
      .from("clientes")
      .select("id, nombre, tipo_documento, numero_documento")
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("productos")
      .select(
        "id, sku, nombre, unidad_medida, usa_combinaciones, precio, activo",
      )
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("combinaciones")
      .select(
        "id, producto_id, sku, precio, activa, valor_opcion_1_id, valor_opcion_2_id",
      )
      .eq("activa", true),
    supabase.from("valores_opcion").select("id, valor, opcion_id"),
    supabase.from("opciones_producto").select("id, nombre"),
  ]);

  if (
    [
      ventas,
      lineas,
      clientes,
      productos,
      combinaciones,
      valores,
      opciones,
    ].some((r) => r.error)
  ) {
    return {
      ventas: [],
      clientes: [],
      productos: [],
      error: "No se pudo cargar la información de ventas.",
    };
  }

  const idsVentas = (ventas.data ?? []).map((venta) => venta.id);
  const comprobantes = idsVentas.length
    ? await supabase
        .from("comprobantes")
        .select("venta_id, estado, enlace_pdf")
        .in("venta_id", idsVentas)
    : { data: [], error: null };
  if (comprobantes.error) {
    return {
      ventas: [],
      clientes: [],
      productos: [],
      error: "No se pudo cargar el estado de los comprobantes.",
    };
  }

  const lineasPorVenta: Record<string, LineaVenta[]> = {};
  const comprobantePorVenta = new Map(
    (comprobantes.data ?? []).map((comprobante) => [
      comprobante.venta_id,
      { estado: comprobante.estado, enlacePdf: comprobante.enlace_pdf },
    ]),
  );
  for (const linea of lineas.data ?? []) {
    lineasPorVenta[linea.venta_id] ??= [];
    lineasPorVenta[linea.venta_id].push({
      id: linea.id,
      productoId: linea.producto_id,
      combinacionId: linea.combinacion_id,
      descripcion: linea.descripcion_congelada,
      sku: linea.sku_congelado,
      unidadMedida: linea.unidad_medida,
      cantidad: Number(linea.cantidad),
      precioUnitario: Number(linea.precio_unitario),
      total: Number(linea.total),
    });
  }

  const valorPorId = new Map((valores.data ?? []).map((v) => [v.id, v]));
  const opcionPorId = new Map(
    (opciones.data ?? []).map((o) => [o.id, o.nombre]),
  );
  const catalogo: ProductoVenta[] = [];
  for (const producto of productos.data ?? []) {
    if (!producto.usa_combinaciones && producto.precio !== null) {
      catalogo.push({
        productoId: producto.id,
        combinacionId: null,
        sku: producto.sku,
        descripcion: producto.nombre,
        precio: Number(producto.precio),
        unidadMedida: producto.unidad_medida,
      });
      continue;
    }
    for (const combinacion of (combinaciones.data ?? []).filter(
      (c) => c.producto_id === producto.id,
    )) {
      const detalle = [
        combinacion.valor_opcion_1_id,
        combinacion.valor_opcion_2_id,
      ]
        .filter((id): id is string => Boolean(id))
        .map((id) => {
          const valor = valorPorId.get(id);
          return `${opcionPorId.get(valor?.opcion_id ?? "") ?? ""} ${valor?.valor ?? ""}`.trim();
        });
      catalogo.push({
        productoId: producto.id,
        combinacionId: combinacion.id,
        sku: combinacion.sku,
        descripcion: `${producto.nombre} ${detalle.join(" ")}`.trim(),
        precio: Number(combinacion.precio),
        unidadMedida: producto.unidad_medida,
      });
    }
  }

  return {
    ventas: (ventas.data ?? []).map((venta) => {
      const comprobante = comprobantePorVenta.get(venta.id);
      return {
        id: venta.id,
        clienteId: venta.cliente_id,
        clienteNombre: venta.cliente_nombre,
        clienteTipoDocumento: venta.cliente_tipo_documento,
        clienteNumeroDocumento: venta.cliente_numero_documento,
        estado: venta.estado,
        moneda: venta.moneda,
        subtotal: Number(venta.subtotal),
        igv: Number(venta.igv),
        total: Number(venta.total),
        creadoEn: venta.creado_en,
        confirmadoEn: venta.confirmado_en,
        creadoPor: venta.creado_por,
        tipoComprobante:
          venta.tipo_comprobante === "factura" ||
          venta.tipo_comprobante === "boleta"
            ? venta.tipo_comprobante
            : null,
        estadoComprobante: comprobante?.estado ?? null,
        enlacePdf: comprobante?.enlacePdf ?? null,
        lineas: lineasPorVenta[venta.id] ?? [],
      };
    }) as Venta[],
    clientes: (clientes.data ?? []).map((cliente) => ({
      id: cliente.id,
      nombre: cliente.nombre,
      documento: cliente.numero_documento,
      tipoDocumento: cliente.tipo_documento,
    })) as ClienteVenta[],
    productos: catalogo,
    error: null,
  };
}
