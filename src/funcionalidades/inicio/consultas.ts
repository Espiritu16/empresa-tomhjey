import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";
import { convertirTotalesPorMoneda } from "@/compartido/formato-moneda";

export type VentaReciente = {
  id: string;
  clienteNombre: string | null;
  estado: string;
  total: number;
  moneda: "PEN" | "USD";
  fecha: string;
};

export async function cargarResumenInicio() {
  const supabase = await crearClienteSupabaseServidor();
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const inicio = new Date(`${hoy}T00:00:00-05:00`);
  const fin = new Date(`${hoy}T00:00:00-05:00`);
  fin.setUTCDate(fin.getUTCDate() + 1);
  const [resumen, productos, ventas] = await Promise.all([
    supabase.rpc("resumen_inicio", {
      desde: inicio.toISOString(),
      hasta: fin.toISOString(),
    }),
    supabase
      .from("productos")
      .select("id", { count: "exact", head: true })
      .eq("activo", true),
    supabase
      .from("ventas")
      .select(
        "id, cliente_nombre, estado, total, moneda, creado_en, confirmado_en",
      )
      .order("creado_en", { ascending: false })
      .limit(6),
  ]);
  if (resumen.error || productos.error || ventas.error) {
    return {
      resumen: null,
      productos: productos.count ?? 0,
      recientes: [],
      error: "No se pudo cargar el resumen de la empresa.",
    };
  }
  const valores = (resumen.data ?? {}) as Record<string, unknown>;
  return {
    resumen: {
      ventas: Number(valores.ventas ?? 0),
      totalesPorMoneda: convertirTotalesPorMoneda(valores.totales_por_moneda),
      monedaBase: valores.moneda_base === "USD" ? "USD" : "PEN",
      stockBajo: Number(valores.stock_bajo ?? 0),
    },
    productos: productos.count ?? 0,
    recientes: (ventas.data ?? []).map((venta) => ({
      id: venta.id,
      clienteNombre: venta.cliente_nombre,
      estado: venta.estado,
      total: Number(venta.total),
      moneda: venta.moneda,
      fecha: venta.confirmado_en ?? venta.creado_en,
    })) as VentaReciente[],
    error: null,
  };
}
