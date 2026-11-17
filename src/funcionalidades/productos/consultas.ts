import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";

export type Producto = {
  id: string;
  sku: string;
  codigoBarras: string | null;
  modeloProducto: string | null;
  modeloTalla: string | null;
  nombre: string;
  descripcion: string | null;
  categoriaId: string | null;
  categoriaNombre: string | null;
  unidadMedida: string;
  usaCombinaciones: boolean;
  precio: number | null;
  existencias: number;
  stockMinimo: number;
  activo: boolean;
};

export type Categoria = { id: string; nombre: string };

export async function cargarProductos() {
  const supabase = await crearClienteSupabaseServidor();
  const [productos, categorias] = await Promise.all([
    supabase
      .from("productos")
      .select(
        "id, sku, codigo_barras, modelo_producto, modelo_talla, nombre, descripcion, categoria_id, unidad_medida, usa_combinaciones, precio, existencias, stock_minimo, activo, categorias(nombre), combinaciones(id, precio, existencias, activa)",
      )
      .order("nombre"),
    supabase
      .from("categorias")
      .select("id, nombre")
      .eq("activa", true)
      .order("nombre"),
  ]);

  if (productos.error || categorias.error) {
    return {
      productos: [],
      categorias: [],
      error: "No se pudo cargar el catálogo.",
    };
  }

  return {
    productos: (productos.data ?? []).map((producto) => {
      const categoria = Array.isArray(producto.categorias)
        ? producto.categorias[0]
        : producto.categorias;
      const combinacionesActivas = (producto.combinaciones ?? []).filter(
        (combinacion) => combinacion.activa,
      );
      return {
        id: producto.id,
        sku: producto.sku,
        codigoBarras: producto.codigo_barras,
        modeloProducto: producto.modelo_producto,
        modeloTalla: producto.modelo_talla,
        nombre: producto.nombre,
        descripcion: producto.descripcion,
        categoriaId: producto.categoria_id,
        categoriaNombre: categoria?.nombre ?? null,
        unidadMedida: producto.unidad_medida,
        usaCombinaciones: producto.usa_combinaciones,
        precio: producto.precio === null ? null : Number(producto.precio),
        existencias: producto.usa_combinaciones
          ? combinacionesActivas.reduce(
              (suma, combinacion) => suma + Number(combinacion.existencias),
              0,
            )
          : Number(producto.existencias),
        stockMinimo: Number(producto.stock_minimo),
        activo: producto.activo,
      } satisfies Producto;
    }),
    categorias: (categorias.data ?? []) as Categoria[],
    error: null,
  };
}
