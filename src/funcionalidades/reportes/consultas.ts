import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";
import { convertirTotalesPorMoneda } from "@/compartido/formato-moneda";

export type FilaReporte = {
  descripcion: string;
  moneda: "PEN" | "USD";
  ventas: number;
  unidades: number;
  total: number;
};

export type ResumenReporte = {
  ventas: number;
  totalesPorMoneda: Partial<Record<"PEN" | "USD", number>>;
  monedaBase: "PEN" | "USD";
  stockBajo: number;
};

export function periodoDelMes(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const ultimoDia = new Date(anio, fecha.getMonth() + 1, 0).getDate();
  return { desde: `${anio}-${mes}-01`, hasta: `${anio}-${mes}-${ultimoDia}` };
}

export async function consultarReporte(desde: string, hasta: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(desde) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(hasta) ||
    desde > hasta
  ) {
    return {
      filas: [],
      resumen: null,
      error: "El periodo seleccionado no es válido.",
    };
  }
  const supabase = await crearClienteSupabaseServidor();
  const inicio = new Date(`${desde}T00:00:00-05:00`).toISOString();
  const fin = new Date(`${hasta}T00:00:00-05:00`);
  fin.setDate(fin.getDate() + 1);
  const [reporte, resumen] = await Promise.all([
    supabase.rpc("reporte_ventas", { desde: inicio, hasta: fin.toISOString() }),
    supabase.rpc("resumen_inicio", { desde: inicio, hasta: fin.toISOString() }),
  ]);
  if (reporte.error || resumen.error) {
    return {
      filas: [],
      resumen: null,
      error: "No se pudo cargar el reporte de ventas.",
    };
  }
  const datos = (resumen.data ?? {}) as Record<string, unknown>;
  const filas = (reporte.data ?? []) as {
    descripcion: string;
    moneda: "PEN" | "USD";
    ventas: number;
    unidades: number;
    total: number;
  }[];
  return {
    filas: filas.map((fila) => ({
      descripcion: fila.descripcion,
      moneda: fila.moneda,
      ventas: Number(fila.ventas),
      unidades: Number(fila.unidades),
      total: Number(fila.total),
    })) as FilaReporte[],
    resumen: {
      ventas: Number(datos.ventas ?? 0),
      totalesPorMoneda: convertirTotalesPorMoneda(datos.totales_por_moneda),
      monedaBase: datos.moneda_base === "USD" ? "USD" : "PEN",
      stockBajo: Number(datos.stock_bajo ?? 0),
    } satisfies ResumenReporte,
    error: null,
  };
}
