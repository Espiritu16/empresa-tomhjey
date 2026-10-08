import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";

export type ArticuloInventario = {
  id: string;
  productoId: string;
  combinacionId: string | null;
  sku: string;
  producto: string;
  existencias: number;
  stockMinimo: number;
  activo: boolean;
  unidadMedida: string;
};

export type MovimientoInventario = {
  id: string;
  productoId: string;
  combinacionId: string | null;
  tipo: string;
  cantidad: number;
  existenciasResultantes: number;
  motivo: string;
  creadoEn: string;
  productoNombre: string;
};

export async function cargarInventario() {
  const supabase = await crearClienteSupabaseServidor();
  const [productos, combinaciones, valores, opciones, movimientos] =
    await Promise.all([
      supabase
        .from("productos")
        .select(
          "id, sku, nombre, usa_combinaciones, existencias, stock_minimo, activo, unidad_medida",
        )
        .order("nombre"),
      supabase
        .from("combinaciones")
        .select(
          "id, producto_id, sku, existencias, stock_minimo, activa, valor_opcion_1_id, valor_opcion_2_id",
        )
        .eq("activa", true),
      supabase.from("valores_opcion").select("id, valor, opcion_id"),
      supabase
        .from("opciones_producto")
        .select("id, nombre, posicion, producto_id"),
      supabase
        .from("movimientos_inventario")
        .select(
          "id, producto_id, combinacion_id, tipo, cantidad, existencias_resultantes, motivo, creado_en",
        )
        .order("creado_en", { ascending: false })
        .limit(80),
    ]);

  if (
    productos.error ||
    combinaciones.error ||
    valores.error ||
    opciones.error ||
    movimientos.error
  ) {
    return {
      articulos: [],
      movimientos: [],
      error: "No se pudo cargar el inventario.",
    };
  }

  const productoPorId = new Map((productos.data ?? []).map((p) => [p.id, p]));
  const valorPorId = new Map((valores.data ?? []).map((v) => [v.id, v.valor]));
  const opcionPorId = new Map(
    (opciones.data ?? []).map((o) => [o.id, o.nombre]),
  );
  const articulos: ArticuloInventario[] = [];

  for (const producto of productos.data ?? []) {
    if (!producto.usa_combinaciones) {
      articulos.push({
        id: producto.id,
        productoId: producto.id,
        combinacionId: null,
        sku: producto.sku,
        producto: producto.nombre,
        existencias: Number(producto.existencias),
        stockMinimo: Number(producto.stock_minimo),
        activo: producto.activo,
        unidadMedida: producto.unidad_medida,
      });
      continue;
    }

    const combinacionesProducto = (combinaciones.data ?? []).filter(
      (combinacion) => combinacion.producto_id === producto.id,
    );
    for (const combinacion of combinacionesProducto) {
      const valoresCombinacion = [
        combinacion.valor_opcion_1_id,
        combinacion.valor_opcion_2_id,
      ]
        .filter((id): id is string => Boolean(id))
        .map((id) => {
          const valor = (valores.data ?? []).find((item) => item.id === id);
          return `${opcionPorId.get(valor?.opcion_id ?? "") ?? ""} ${valorPorId.get(id) ?? ""}`.trim();
        });
      articulos.push({
        id: combinacion.id,
        productoId: producto.id,
        combinacionId: combinacion.id,
        sku: combinacion.sku,
        producto: `${producto.nombre} ${valoresCombinacion.join(" ")}`.trim(),
        existencias: Number(combinacion.existencias),
        stockMinimo: Number(combinacion.stock_minimo),
        activo: combinacion.activa,
        unidadMedida: producto.unidad_medida,
      });
    }
  }

  const articulosPorId = new Map(
    articulos.map((articulo) => [articulo.id, articulo]),
  );
  return {
    articulos,
    movimientos: (movimientos.data ?? []).map((movimiento) => {
      const producto = productoPorId.get(movimiento.producto_id);
      const articulo = movimiento.combinacion_id
        ? articulosPorId.get(movimiento.combinacion_id)
        : undefined;
      return {
        id: movimiento.id,
        productoId: movimiento.producto_id,
        combinacionId: movimiento.combinacion_id,
        tipo: movimiento.tipo,
        cantidad: Number(movimiento.cantidad),
        existenciasResultantes: Number(movimiento.existencias_resultantes),
        motivo: movimiento.motivo,
        creadoEn: movimiento.creado_en,
        productoNombre: articulo?.producto ?? producto?.nombre ?? "Producto",
      };
    }),
    error: null,
  };
}
