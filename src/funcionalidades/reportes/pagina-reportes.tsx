"use client";

import { useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import {
  convertirTotalesPorMoneda,
  formatearTotalesPorMoneda,
} from "@/compartido/formato-moneda";
import type { FilaReporte, ResumenReporte } from "./consultas";

export function PaginaReportes({
  periodoInicial,
  filasIniciales,
  resumenInicial,
  errorInicial,
}: {
  periodoInicial: { desde: string; hasta: string };
  filasIniciales: FilaReporte[];
  resumenInicial: ResumenReporte | null;
  errorInicial: string | null;
}) {
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [filas, setFilas] = useState(filasIniciales);
  const [resumen, setResumen] = useState(resumenInicial);
  const [error, setError] = useState(errorInicial);
  const [cargando, setCargando] = useState(false);

  async function aplicarPeriodo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    if (!periodo.desde || !periodo.hasta || periodo.desde > periodo.hasta) {
      setError("Elige un rango de fechas válido.");
      return;
    }
    setCargando(true);
    const inicio = new Date(`${periodo.desde}T00:00:00-05:00`).toISOString();
    const fin = new Date(`${periodo.hasta}T00:00:00-05:00`);
    fin.setDate(fin.getDate() + 1);
    const supabase = crearClienteSupabase();
    const [reporte, resumenRespuesta] = await Promise.all([
      supabase.rpc("reporte_ventas", {
        desde: inicio,
        hasta: fin.toISOString(),
      }),
      supabase.rpc("resumen_inicio", {
        desde: inicio,
        hasta: fin.toISOString(),
      }),
    ]);
    setCargando(false);
    if (reporte.error || resumenRespuesta.error) {
      setError("No se pudo cargar el reporte. Inténtalo de nuevo.");
      return;
    }
    const datos = (resumenRespuesta.data ?? {}) as Record<string, unknown>;
    const filasRespuesta = (reporte.data ?? []) as {
      descripcion: string;
      moneda: "PEN" | "USD";
      ventas: number;
      unidades: number;
      total: number;
    }[];
    setFilas(
      filasRespuesta.map((fila) => ({
        descripcion: fila.descripcion,
        moneda: fila.moneda,
        ventas: Number(fila.ventas),
        unidades: Number(fila.unidades),
        total: Number(fila.total),
      })),
    );
    setResumen({
      ventas: Number(datos.ventas ?? 0),
      totalesPorMoneda: convertirTotalesPorMoneda(datos.totales_por_moneda),
      monedaBase: datos.moneda_base === "USD" ? "USD" : "PEN",
      stockBajo: Number(datos.stock_bajo ?? 0),
    });
  }

  return (
    <section className="modulo-operativo">
      <header className="encabezado-seccion">
        <div>
          <p className="rotulo">RESULTADOS DEL NEGOCIO</p>
          <h1>Reportes</h1>
          <p className="encabezado-seccion__texto">
            Revisa las ventas confirmadas y los productos con mayor movimiento.
          </p>
        </div>
      </header>

      {error ? (
        <p
          aria-live="assertive"
          className="modulo-operativo__aviso modulo-operativo__aviso--error"
        >
          {error}
        </p>
      ) : null}

      <form
        className="modulo-operativo__panel modulo-operativo__acciones"
        onSubmit={aplicarPeriodo}
      >
        <label className="campo">
          <span>Desde</span>
          <input
            aria-label="Desde"
            onChange={(evento) =>
              setPeriodo((actual) => ({
                ...actual,
                desde: evento.target.value,
              }))
            }
            required
            type="date"
            value={periodo.desde}
          />
        </label>
        <label className="campo">
          <span>Hasta</span>
          <input
            aria-label="Hasta"
            onChange={(evento) =>
              setPeriodo((actual) => ({
                ...actual,
                hasta: evento.target.value,
              }))
            }
            required
            type="date"
            value={periodo.hasta}
          />
        </label>
        <button className="boton-principal" disabled={cargando} type="submit">
          {cargando ? "Cargando…" : "Aplicar periodo"}
        </button>
      </form>

      <section aria-label="Resumen de ventas" className="tarjetas-indicadores">
        <Indicador
          rotulo="VENTAS CONFIRMADAS"
          valor={resumen ? String(resumen.ventas) : "—"}
        />
        <Indicador
          rotulo="TOTAL VENDIDO"
          valor={
            resumen
              ? formatearTotalesPorMoneda(
                  resumen.totalesPorMoneda,
                  resumen.monedaBase,
                )
              : "—"
          }
        />
        <Indicador
          rotulo="PRODUCTOS POR REPONER"
          valor={resumen ? String(resumen.stockBajo) : "—"}
        />
      </section>

      <section className="tarjeta-panel">
        <div className="tarjeta-panel__encabezado">
          <div>
            <p className="rotulo">VENTAS POR PRODUCTO</p>
            <h2>Detalle del periodo</h2>
          </div>
        </div>
        <div className="modulo-operativo__tabla-contenedor">
          <table className="modulo-operativo__tabla">
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Ventas</th>
                <th scope="col">Unidades</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={`${fila.moneda}-${fila.descripcion}`}>
                  <td>
                    <strong>{fila.descripcion}</strong>
                  </td>
                  <td>{fila.ventas}</td>
                  <td>
                    {new Intl.NumberFormat("es-PE", {
                      maximumFractionDigits: 3,
                    }).format(fila.unidades)}
                  </td>
                  <td>
                    {formatearTotalesPorMoneda({ [fila.moneda]: fila.total })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filas.length === 0 ? (
            <div className="modulo-operativo__vacio" role="status">
              <strong>Aún no hay ventas en este periodo</strong>
              <span>Las ventas confirmadas aparecerán aquí.</span>
            </div>
          ) : null}
        </div>
      </section>
    </section>
  );
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <article className="tarjeta-indicador">
      <p className="tarjeta-indicador__rotulo">{rotulo}</p>
      <p className="tarjeta-indicador__valor">{valor}</p>
    </article>
  );
}
