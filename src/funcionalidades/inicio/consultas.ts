import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";
import { convertirTotalesPorMoneda } from "@/compartido/formato-moneda";

type Moneda = "PEN" | "USD";
type Totales = Partial<Record<Moneda, number>>;

export type VentaReciente = {
  id: string;
  clienteNombre: string | null;
  estado: string;
  total: number;
  moneda: Moneda;
  fecha: string;
};

export type DiaVentas = {
  fecha: string;
  totales: Totales;
  ventas: number;
};

export type ProductoVendido = {
  descripcion: string;
  unidades: number;
};

export type ArticuloPorReponer = {
  id: string;
  nombre: string;
  existencias: number;
  stockMinimo: number;
  unidad: string;
};

export type ComprobantePendiente = {
  id: string;
  tipo: "boleta" | "factura";
  serie: string;
  numero: number;
  estado: "pendiente" | "emitiendo" | "rechazado" | "error";
};

const ZONA = "America/Lima";
const DIAS_GRAFICO = 7;
const ESTADOS_PENDIENTES = ["pendiente", "emitiendo", "rechazado", "error"];

/** Fecha calendario (AAAA-MM-DD) en Lima para un instante. */
function fechaLima(instante: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/** Inicio del día en Lima (UTC-5, sin horario de verano). */
function inicioDia(fecha: string) {
  return new Date(`${fecha}T00:00:00-05:00`);
}

function sumarDias(fecha: string, dias: number) {
  const base = inicioDia(fecha);
  base.setUTCDate(base.getUTCDate() + dias);
  return fechaLima(base);
}

export async function cargarResumenInicio() {
  const supabase = await crearClienteSupabaseServidor();
  const hoy = fechaLima(new Date());
  const manana = sumarDias(hoy, 1);
  const primerDiaGrafico = sumarDias(hoy, -(DIAS_GRAFICO - 1));
  const inicioMes = `${hoy.slice(0, 8)}01`;

  const [
    resumenMes,
    ventasSemana,
    masVendidos,
    productos,
    combinaciones,
    comprobantes,
    recientes,
  ] = await Promise.all([
    supabase.rpc("resumen_inicio", {
      desde: inicioDia(inicioMes).toISOString(),
      hasta: inicioDia(manana).toISOString(),
    }),
    supabase
      .from("ventas")
      .select("total, moneda, confirmado_en")
      .eq("estado", "confirmada")
      .gte("confirmado_en", inicioDia(primerDiaGrafico).toISOString())
      .lt("confirmado_en", inicioDia(manana).toISOString()),
    supabase.rpc("reporte_ventas", {
      desde: inicioDia(inicioMes).toISOString(),
      hasta: inicioDia(manana).toISOString(),
    }),
    supabase
      .from("productos")
      .select(
        "id, nombre, usa_combinaciones, existencias, stock_minimo, unidad_medida",
      )
      .eq("activo", true),
    supabase
      .from("combinaciones")
      .select("id, producto_id, sku, existencias, stock_minimo")
      .eq("activa", true),
    supabase
      .from("comprobantes")
      .select("id, tipo, serie, numero, estado", { count: "exact" })
      .in("estado", ESTADOS_PENDIENTES)
      .order("creado_en", { ascending: false })
      .limit(4),
    supabase
      .from("ventas")
      .select(
        "id, cliente_nombre, estado, total, moneda, creado_en, confirmado_en",
      )
      .order("creado_en", { ascending: false })
      .limit(5),
  ]);

  const error =
    resumenMes.error ||
    ventasSemana.error ||
    masVendidos.error ||
    productos.error ||
    combinaciones.error ||
    comprobantes.error ||
    recientes.error;

  if (error) {
    return {
      datos: null,
      error: "No se pudo cargar el resumen de la empresa.",
    };
  }

  const valoresMes = (resumenMes.data ?? {}) as Record<string, unknown>;
  const monedaBase: Moneda = valoresMes.moneda_base === "USD" ? "USD" : "PEN";

  const dias = new Map<string, DiaVentas>();
  for (let i = 0; i < DIAS_GRAFICO; i++) {
    const fecha = sumarDias(primerDiaGrafico, i);
    dias.set(fecha, { fecha, totales: {}, ventas: 0 });
  }
  for (const venta of ventasSemana.data ?? []) {
    if (!venta.confirmado_en) continue;
    const dia = dias.get(fechaLima(new Date(venta.confirmado_en)));
    if (!dia) continue;
    const moneda = venta.moneda as Moneda;
    dia.totales[moneda] = (dia.totales[moneda] ?? 0) + Number(venta.total);
    dia.ventas += 1;
  }

  const unidadesPorProducto = new Map<string, number>();
  for (const fila of (masVendidos.data ?? []) as {
    descripcion: string;
    unidades: number;
  }[]) {
    unidadesPorProducto.set(
      fila.descripcion,
      (unidadesPorProducto.get(fila.descripcion) ?? 0) + Number(fila.unidades),
    );
  }
  const topProductos: ProductoVendido[] = [...unidadesPorProducto]
    .map(([descripcion, unidades]) => ({ descripcion, unidades }))
    .sort((a, b) => b.unidades - a.unidades)
    .slice(0, 5);

  const productoPorId = new Map(
    (productos.data ?? []).map((producto) => [producto.id, producto]),
  );
  const porReponer: ArticuloPorReponer[] = [];
  for (const producto of productos.data ?? []) {
    if (producto.usa_combinaciones) continue;
    if (Number(producto.existencias) > Number(producto.stock_minimo)) continue;
    porReponer.push({
      id: producto.id,
      nombre: producto.nombre,
      existencias: Number(producto.existencias),
      stockMinimo: Number(producto.stock_minimo),
      unidad: producto.unidad_medida,
    });
  }
  for (const combinacion of combinaciones.data ?? []) {
    const producto = productoPorId.get(combinacion.producto_id);
    if (!producto?.usa_combinaciones) continue;
    if (Number(combinacion.existencias) > Number(combinacion.stock_minimo)) {
      continue;
    }
    porReponer.push({
      id: combinacion.id,
      nombre: `${producto.nombre} · ${combinacion.sku}`,
      existencias: Number(combinacion.existencias),
      stockMinimo: Number(combinacion.stock_minimo),
      unidad: producto.unidad_medida,
    });
  }
  porReponer.sort((a, b) => a.existencias - b.existencias);

  return {
    datos: {
      fechaHoy: hoy,
      monedaBase,
      hoy: dias.get(hoy) ?? { fecha: hoy, totales: {}, ventas: 0 },
      ayer: dias.get(sumarDias(hoy, -1)) ?? {
        fecha: sumarDias(hoy, -1),
        totales: {},
        ventas: 0,
      },
      semana: [...dias.values()],
      mes: {
        ventas: Number(valoresMes.ventas ?? 0),
        totales: convertirTotalesPorMoneda(valoresMes.totales_por_moneda),
      },
      productosActivos: productos.data?.length ?? 0,
      topProductos,
      porReponer: porReponer.slice(0, 5),
      totalPorReponer: porReponer.length,
      comprobantes: (comprobantes.data ?? []) as ComprobantePendiente[],
      totalComprobantes: comprobantes.count ?? 0,
      recientes: (recientes.data ?? []).map((venta) => ({
        id: venta.id,
        clienteNombre: venta.cliente_nombre,
        estado: venta.estado,
        total: Number(venta.total),
        moneda: venta.moneda,
        fecha: venta.confirmado_en ?? venta.creado_en,
      })) as VentaReciente[],
    },
    error: null,
  };
}
