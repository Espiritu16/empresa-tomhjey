"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import type { ArticuloInventario, MovimientoInventario } from "./consultas";

type Propiedades = {
  articulos: ArticuloInventario[];
  movimientos: MovimientoInventario[];
  puedeAjustar: boolean;
  errorInicial: string | null;
};

export function PaginaInventario({
  articulos,
  movimientos,
  puedeAjustar,
  errorInicial,
}: Propiedades) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState(errorInicial);
  const articulosVisibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es-PE");
    return texto
      ? articulos.filter((articulo) =>
          `${articulo.sku} ${articulo.producto}`
            .toLocaleLowerCase("es-PE")
            .includes(texto),
        )
      : articulos;
  }, [articulos, busqueda]);

  async function registrarAjuste(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setMensaje(null);
    const cambio = Number(cantidad);
    if (
      !articuloSeleccionado ||
      !Number.isFinite(cambio) ||
      cambio === 0 ||
      !motivo.trim()
    ) {
      setError(
        "Elige un producto, indica una cantidad distinta de cero y escribe el motivo.",
      );
      return;
    }
    const [productoId, combinacionId] = articuloSeleccionado.split("|");
    setGuardando(true);
    const { error: errorAjuste } = await crearClienteSupabase().rpc(
      "ajustar_existencias",
      {
        producto_objetivo: productoId,
        combinacion_objetivo: combinacionId || null,
        cambio,
        razon: motivo.trim(),
      },
    );
    setGuardando(false);
    if (errorAjuste) {
      setError(
        errorAjuste.message.includes("negativo")
          ? "El ajuste dejaría existencias negativas. Revisa la cantidad."
          : errorAjuste.message.includes("Solo administración")
            ? "Solo administración puede ajustar existencias."
            : "No se pudo registrar el ajuste. Revisa los datos e inténtalo de nuevo.",
      );
      return;
    }
    setAbierto(false);
    setCantidad("");
    setMotivo("");
    setArticuloSeleccionado("");
    setMensaje("El ajuste se registró y el movimiento quedó guardado.");
    router.refresh();
  }

  return (
    <section className="modulo-operativo">
      <header className="encabezado-seccion">
        <div>
          <p className="rotulo">EXISTENCIAS Y MOVIMIENTOS</p>
          <h1>Inventario</h1>
          <p className="encabezado-seccion__texto">
            Revisa el saldo disponible y el historial de cada movimiento.
          </p>
        </div>
      </header>

      {error ? (
        <p
          aria-live="assertive"
          className="modulo-operativo__aviso modulo-operativo__aviso--error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {mensaje ? (
        <p
          aria-live="polite"
          className="modulo-operativo__aviso modulo-operativo__aviso--bien"
        >
          {mensaje}
        </p>
      ) : null}

      <div className="modulo-operativo__barra">
        <label className="campo">
          <span className="sr-only">Buscar en inventario</span>
          <input
            aria-label="Buscar en inventario"
            className="modulo-operativo__busqueda"
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar por producto o SKU"
            type="search"
            value={busqueda}
          />
        </label>
        {puedeAjustar ? (
          <button
            className="boton-principal"
            onClick={() => {
              setError(null);
              setAbierto(true);
            }}
            type="button"
          >
            Registrar ajuste
          </button>
        ) : null}
      </div>

      <div className="modulo-operativo__tabla-contenedor">
        <table className="modulo-operativo__tabla">
          <thead>
            <tr>
              <th scope="col">SKU</th>
              <th scope="col">Producto o combinación</th>
              <th scope="col">Existencias</th>
              <th scope="col">Stock mínimo</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {articulosVisibles.map((articulo) => (
              <tr key={articulo.id}>
                <td>{articulo.sku}</td>
                <td>{articulo.producto}</td>
                <td>
                  {formatearCantidad(
                    articulo.existencias,
                    articulo.unidadMedida,
                  )}
                </td>
                <td>
                  {formatearCantidad(
                    articulo.stockMinimo,
                    articulo.unidadMedida,
                  )}
                </td>
                <td>
                  <span
                    className={`modulo-operativo__estado${articulo.activo ? " modulo-operativo__estado--activo" : ""}`}
                  >
                    {articulo.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {articulosVisibles.length === 0 ? (
          <div className="modulo-operativo__vacio" role="status">
            <strong>
              {busqueda
                ? "No encontramos existencias"
                : "No hay productos en inventario"}
            </strong>
            <span>
              Los productos nuevos aparecerán aquí con su saldo actual.
            </span>
          </div>
        ) : null}
      </div>

      <section
        aria-labelledby="movimientos-titulo"
        className="modulo-operativo__panel"
      >
        <div className="tarjeta-panel__encabezado">
          <div>
            <p className="rotulo">HISTORIAL</p>
            <h2 id="movimientos-titulo">Movimientos recientes</h2>
          </div>
        </div>
        {movimientos.length ? (
          <div className="modulo-operativo__tabla-contenedor">
            <table className="modulo-operativo__tabla">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Producto</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Cambio</th>
                  <th scope="col">Saldo</th>
                  <th scope="col">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((movimiento) => {
                  const articulo = articulos.find(
                    (item) =>
                      item.id ===
                      (movimiento.combinacionId ?? movimiento.productoId),
                  );
                  return (
                    <tr key={movimiento.id}>
                      <td>{formatearFecha(movimiento.creadoEn)}</td>
                      <td>{articulo?.producto ?? "Producto"}</td>
                      <td>
                        {movimiento.tipo === "venta" ? "Venta" : "Ajuste"}
                      </td>
                      <td>
                        {formatearCantidad(
                          movimiento.cantidad,
                          articulo?.unidadMedida ?? "",
                        )}
                      </td>
                      <td>
                        {formatearCantidad(
                          movimiento.existenciasResultantes,
                          articulo?.unidadMedida ?? "",
                        )}
                      </td>
                      <td>{movimiento.motivo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="modulo-operativo__vacio">
            Todavía no hay movimientos registrados.
          </p>
        )}
      </section>

      {abierto ? (
        <div className="modulo-operativo__dialogo-fondo">
          <section
            aria-labelledby="ajuste-titulo"
            aria-modal="true"
            className="modulo-operativo__dialogo"
            role="dialog"
          >
            <h2 id="ajuste-titulo">Registrar ajuste</h2>
            <form
              className="modulo-operativo__formulario"
              onSubmit={registrarAjuste}
            >
              <label className="campo modulo-operativo__ancho-completo">
                <span>Producto o combinación</span>
                <select
                  onChange={(evento) =>
                    setArticuloSeleccionado(evento.target.value)
                  }
                  required
                  value={articuloSeleccionado}
                >
                  <option value="">Selecciona un producto</option>
                  {articulos
                    .filter((articulo) => articulo.activo)
                    .map((articulo) => (
                      <option
                        key={articulo.id}
                        value={`${articulo.productoId}|${articulo.combinacionId ?? ""}`}
                      >
                        {articulo.sku} — {articulo.producto}
                      </option>
                    ))}
                </select>
              </label>
              <label className="campo modulo-operativo__ancho-completo">
                <span>Cantidad de ajuste</span>
                <input
                  aria-label="Cantidad de ajuste"
                  inputMode="decimal"
                  onChange={(evento) => setCantidad(evento.target.value)}
                  required
                  step="0.001"
                  type="number"
                  value={cantidad}
                />
                <small>
                  Usa un número positivo para sumar o negativo para restar.
                </small>
              </label>
              <label className="campo modulo-operativo__ancho-completo">
                <span>Motivo del ajuste</span>
                <textarea
                  aria-label="Motivo del ajuste"
                  onChange={(evento) => setMotivo(evento.target.value)}
                  required
                  value={motivo}
                />
              </label>
              {error ? (
                <p
                  className="modulo-operativo__aviso modulo-operativo__aviso--error modulo-operativo__ancho-completo"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <div className="modulo-operativo__acciones modulo-operativo__ancho-completo">
                <button
                  className="boton-principal"
                  disabled={guardando}
                  type="submit"
                >
                  {guardando ? "Guardando…" : "Guardar ajuste"}
                </button>
                <button
                  className="modulo-operativo__boton-secundario"
                  disabled={guardando}
                  onClick={() => setAbierto(false)}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function formatearCantidad(cantidad: number, unidad: string): string {
  const valor = new Intl.NumberFormat("es-PE", {
    maximumFractionDigits: 3,
  }).format(cantidad);
  return unidad ? `${valor} ${unidad}` : valor;
}

function formatearFecha(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(fecha));
}
