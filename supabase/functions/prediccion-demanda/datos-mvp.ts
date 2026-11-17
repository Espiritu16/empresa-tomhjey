/**
 * Arma los registros del modelo con los datos que el MVP ya guarda, para que nadie
 * tenga que escribir ventas ni stock a mano:
 * - ventas: suma de `lineas_venta.cantidad` de ventas confirmadas por semana (lunes–domingo, hora de Lima);
 * - stock actual, precio y stock mínimo (= stock de seguridad): ficha del producto;
 * - quiebre de la semana anterior: algún movimiento dejó las existencias en 0.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  ErrorValidacion,
  type ParametrosModelo,
  predecirDemanda,
  type ResultadoDemanda,
} from "./modelo.ts";

const DIA_MS = 86_400_000;
const DESFASE_LIMA_MS = 5 * 60 * 60 * 1000; // Lima es UTC−5 todo el año.
const MAXIMO_PRODUCTOS = 500;
// El modelo aprendió con los precios del catálogo; si la ficha del MVP se aleja
// más de esto, se usa el precio de lista del catálogo para no extrapolar.
const DESVIO_MAXIMO_PRECIO = 0.3;

/** Precio que se envía al modelo: el de la ficha si es comparable al del catálogo. */
export function precioParaModelo(
  precioFicha: number | null,
  precioCatalogo: number,
): number {
  const ficha = Number(precioFicha);
  if (
    Number.isFinite(ficha) &&
    ficha > 0 &&
    Math.abs(ficha - precioCatalogo) <= DESVIO_MAXIMO_PRECIO * precioCatalogo
  ) {
    return ficha;
  }
  return precioCatalogo;
}

/** Fecha (AAAA-MM-DD) del lunes de la semana actual en Lima. */
export function lunesActualLima(ahora = new Date()): string {
  const enLima = new Date(ahora.getTime() - DESFASE_LIMA_MS);
  const diasDesdeLunes = (enLima.getUTCDay() + 6) % 7;
  return new Date(enLima.getTime() - diasDesdeLunes * DIA_MS)
    .toISOString()
    .slice(0, 10);
}

/** Instante UTC en que empieza (00:00 en Lima) un día AAAA-MM-DD. */
export function inicioDiaLima(fecha: string): Date {
  return new Date(`${fecha}T05:00:00Z`);
}

/** Inicios (en Lima) de las 4 semanas anteriores, de la más antigua a la más reciente. */
export function semanasPrevias(lunes: string): Date[] {
  const inicio = inicioDiaLima(lunes).getTime();
  return [4, 3, 2, 1].map((k) => new Date(inicio - k * 7 * DIA_MS));
}

/** Suma las cantidades vendidas en cada una de las 4 semanas previas. */
export function ventasPorSemana(
  lineas: { cantidad: number; confirmado_en: string }[],
  lunes: string,
): number[] {
  const semanas = semanasPrevias(lunes).map((d) => d.getTime());
  const totales = [0, 0, 0, 0];
  for (const linea of lineas) {
    const instante = new Date(linea.confirmado_en).getTime();
    for (let i = 0; i < 4; i++) {
      if (instante >= semanas[i] && instante < semanas[i] + 7 * DIA_MS) {
        totales[i] += Number(linea.cantidad);
      }
    }
  }
  return totales.map((total) => Math.round(total * 1000) / 1000);
}

type ProductoMvp = {
  id: string;
  sku: string;
  nombre: string;
  precio: number | null;
  existencias: number;
  stock_minimo: number;
  modelo_producto: string;
  modelo_talla: string;
};

export type FilaReposicion = {
  producto_id: string;
  sku: string;
  nombre: string;
  modelo_producto: string;
  modelo_talla: string;
  ventas_ultimas_4_semanas: number[];
  stock_actual: number;
  stock_seguridad: number;
  hubo_quiebre_semana_anterior: boolean;
  resultado: ResultadoDemanda | null;
  error: string | null;
};

export type RespuestaReposicion = {
  semana: string;
  modelo: string;
  mae_prueba: number;
  productos: FilaReposicion[];
  /** Productos simples activos que todavía no eligieron su vínculo. */
  productos_sin_vincular: number;
  /** Productos activos con variantes de talla o color: aún no se pueden vincular. */
  productos_con_variantes: number;
};

/** Calcula la reposición sugerida de todos los productos activos vinculados al modelo. */
export async function reposicionDesdeMvp(
  cliente: SupabaseClient,
  parametros: ParametrosModelo,
  ahora = new Date(),
): Promise<RespuestaReposicion> {
  const lunes = lunesActualLima(ahora);
  const semanas = semanasPrevias(lunes);
  const desde = semanas[0].toISOString();
  const hasta = inicioDiaLima(lunes).toISOString();

  const [vinculados, sinVincular, conVariantes] = await Promise.all([
    cliente
      .from("productos")
      .select(
        "id, sku, nombre, precio, existencias, stock_minimo, modelo_producto, modelo_talla",
      )
      .eq("activo", true)
      .eq("usa_combinaciones", false)
      .not("modelo_producto", "is", null)
      .order("nombre")
      .limit(MAXIMO_PRODUCTOS),
    cliente
      .from("productos")
      .select("id", { count: "exact", head: true })
      .eq("activo", true)
      .eq("usa_combinaciones", false)
      .is("modelo_producto", null),
    cliente
      .from("productos")
      .select("id", { count: "exact", head: true })
      .eq("activo", true)
      .eq("usa_combinaciones", true),
  ]);
  if (vinculados.error || sinVincular.error || conVariantes.error) {
    throw new Error("No se pudieron leer los productos.");
  }
  const productos = (vinculados.data ?? []) as ProductoMvp[];
  const ids = productos.map((producto) => producto.id);

  const [lineas, movimientos] = ids.length
    ? await Promise.all([
        cliente
          .from("lineas_venta")
          .select("producto_id, cantidad, ventas!inner(estado, confirmado_en)")
          .in("producto_id", ids)
          .eq("ventas.estado", "confirmada")
          .gte("ventas.confirmado_en", desde)
          .lt("ventas.confirmado_en", hasta),
        cliente
          .from("movimientos_inventario")
          .select("producto_id, existencias_resultantes")
          .in("producto_id", ids)
          .gte("creado_en", semanas[3].toISOString())
          .lt("creado_en", hasta),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (lineas.error || movimientos.error) {
    throw new Error("No se pudieron leer las ventas o los movimientos.");
  }

  const lineasPorProducto = new Map<
    string,
    { cantidad: number; confirmado_en: string }[]
  >();
  for (const linea of (lineas.data ?? []) as unknown as {
    producto_id: string;
    cantidad: number;
    ventas: { confirmado_en: string } | { confirmado_en: string }[];
  }[]) {
    const venta = Array.isArray(linea.ventas) ? linea.ventas[0] : linea.ventas;
    if (!venta?.confirmado_en) continue;
    const lista = lineasPorProducto.get(linea.producto_id) ?? [];
    lista.push({
      cantidad: Number(linea.cantidad),
      confirmado_en: venta.confirmado_en,
    });
    lineasPorProducto.set(linea.producto_id, lista);
  }
  const conQuiebre = new Set(
    (
      (movimientos.data ?? []) as {
        producto_id: string;
        existencias_resultantes: number;
      }[]
    )
      .filter((movimiento) => Number(movimiento.existencias_resultantes) <= 0)
      .map((movimiento) => movimiento.producto_id),
  );

  const filas: FilaReposicion[] = productos.map((producto) => {
    const ventas = ventasPorSemana(
      lineasPorProducto.get(producto.id) ?? [],
      lunes,
    );
    const catalogo = parametros.catalogo[producto.modelo_producto];
    const fila: FilaReposicion = {
      producto_id: producto.id,
      sku: producto.sku,
      nombre: producto.nombre,
      modelo_producto: producto.modelo_producto,
      modelo_talla: producto.modelo_talla,
      ventas_ultimas_4_semanas: ventas,
      stock_actual: Math.max(0, Number(producto.existencias)),
      stock_seguridad: Math.max(0, Number(producto.stock_minimo)),
      hubo_quiebre_semana_anterior: conQuiebre.has(producto.id),
      resultado: null,
      error: null,
    };
    try {
      fila.resultado = predecirDemanda(
        {
          producto_id: producto.modelo_producto,
          talla: producto.modelo_talla,
          semana: lunes,
          precio_lista: precioParaModelo(
            producto.precio,
            catalogo?.precio_lista ?? 0,
          ),
          descuento: 0,
          ventas_ultimas_4_semanas: ventas,
          hubo_quiebre_semana_anterior: fila.hubo_quiebre_semana_anterior,
          stock_actual: fila.stock_actual,
          stock_seguridad: fila.stock_seguridad,
        },
        parametros,
      );
    } catch (error) {
      fila.error =
        error instanceof ErrorValidacion
          ? error.message
          : "No se pudo calcular la sugerencia.";
    }
    return fila;
  });

  filas.sort(
    (a, b) =>
      (b.resultado?.reposicion_sugerida ?? -1) -
      (a.resultado?.reposicion_sugerida ?? -1),
  );

  return {
    semana: lunes,
    modelo: parametros.nombre_modelo,
    mae_prueba: parametros.metricas_prueba.MAE,
    productos: filas,
    productos_sin_vincular: sinVincular.count ?? 0,
    productos_con_variantes: conVariantes.count ?? 0,
  };
}
