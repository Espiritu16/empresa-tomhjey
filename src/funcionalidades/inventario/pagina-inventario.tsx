"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import { DialogoModal } from "@/compartido/componentes/dialogo-modal";
import { BotonLectorCodigo } from "@/compartido/componentes/lector-codigo";
import { useNotificaciones } from "@/compartido/notificaciones/proveedor-notificaciones";
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
  const notificaciones = useNotificaciones();
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [articuloSeleccionado, setArticuloSeleccionado] = useState("");
  const [stockFinal, setStockFinal] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(errorInicial);
  const articulosVisibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es-PE");
    return texto
      ? articulos.filter((articulo) =>
          `${articulo.sku} ${articulo.codigoBarras ?? ""} ${articulo.producto}`
            .toLocaleLowerCase("es-PE")
            .includes(texto),
        )
      : articulos;
  }, [articulos, busqueda]);

  async function registrarAjuste(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    const nuevoStock = Number(stockFinal);
    if (
      !articuloSeleccionado ||
      !Number.isFinite(nuevoStock) ||
      nuevoStock < 0 ||
      !motivo.trim()
    ) {
      setError(
        "Elige un producto, indica el nuevo stock y escribe el motivo del ajuste.",
      );
      return;
    }
    const [productoId, combinacionId] = articuloSeleccionado.split("|");
    setGuardando(true);
    const { error: errorAjuste } = await crearClienteSupabase().rpc(
      "establecer_stock_final",
      {
        producto_objetivo: productoId,
        combinacion_objetivo: combinacionId || null,
        existencias_nuevas: nuevoStock,
        razon: motivo.trim(),
      },
    );
    setGuardando(false);
    if (errorAjuste) {
      const detalle = errorAjuste.message.includes("coincide")
        ? "El nuevo stock debe ser distinto al stock actual."
        : errorAjuste.message.includes("Solo administración")
          ? "Solo administración puede ajustar existencias."
          : errorAjuste.message.includes("stock final")
            ? "Ingresa un stock final válido y el motivo del ajuste."
            : "No se pudo registrar el ajuste. Revisa los datos e inténtalo de nuevo.";
      if (errorAjuste.message.includes("Solo administración")) {
        notificaciones.error(detalle);
      } else {
        setError(detalle);
      }
      return;
    }
    setAbierto(false);
    setStockFinal("");
    setMotivo("");
    setArticuloSeleccionado("");
    notificaciones.exito(
      "El ajuste se registró y el movimiento quedó guardado.",
    );
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
      <div className="modulo-operativo__barra">
        <div className="campo-con-lector">
          <label className="campo">
            <span className="sr-only">Buscar en inventario</span>
            <input
              aria-label="Buscar en inventario"
              className="modulo-operativo__busqueda"
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Buscar por producto, SKU o código de barras"
              type="search"
              value={busqueda}
            />
          </label>
          <BotonLectorCodigo
            etiqueta="Buscar por código de barras"
            onLeido={setBusqueda}
          />
        </div>
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
                <td data-etiqueta="SKU">{articulo.sku}</td>
                <td data-etiqueta="Producto o combinación" data-principal>
                  {articulo.producto}
                </td>
                <td data-etiqueta="Existencias">
                  {formatearCantidad(
                    articulo.existencias,
                    articulo.unidadMedida,
                  )}
                </td>
                <td data-etiqueta="Stock mínimo">
                  {formatearCantidad(
                    articulo.stockMinimo,
                    articulo.unidadMedida,
                  )}
                </td>
                <td data-etiqueta="Estado">
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
                      <td data-etiqueta="Fecha">
                        {formatearFecha(movimiento.creadoEn)}
                      </td>
                      <td data-etiqueta="Producto" data-principal>
                        {articulo?.producto ?? "Producto"}
                      </td>
                      <td data-etiqueta="Tipo">
                        {movimiento.tipo === "venta" ? "Venta" : "Ajuste"}
                      </td>
                      <td data-etiqueta="Cambio">
                        {formatearCantidad(
                          movimiento.cantidad,
                          articulo?.unidadMedida ?? "",
                        )}
                      </td>
                      <td data-etiqueta="Saldo">
                        {formatearCantidad(
                          movimiento.existenciasResultantes,
                          articulo?.unidadMedida ?? "",
                        )}
                      </td>
                      <td data-etiqueta="Motivo">{movimiento.motivo}</td>
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

      <DialogoModal
        abierto={abierto}
        bloqueado={guardando}
        onCerrar={() => setAbierto(false)}
        titulo="Registrar ajuste"
      >
        <form
          className="modulo-operativo__formulario"
          onSubmit={registrarAjuste}
        >
          <label className="campo modulo-operativo__ancho-completo">
            <span>Producto o combinación</span>
            <select
              onChange={(evento) => {
                const seleccionado = evento.target.value;
                setArticuloSeleccionado(seleccionado);
                setStockFinal("");
                setError(null);
              }}
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
          <label className="campo">
            <span>Stock actual</span>
            <input
              aria-label="Stock actual"
              readOnly
              type="number"
              value={
                articulos.find(
                  (item) =>
                    `${item.productoId}|${item.combinacionId ?? ""}` ===
                    articuloSeleccionado,
                )?.existencias ?? ""
              }
            />
          </label>
          <label className="campo">
            <span>Nuevo stock</span>
            <input
              aria-label="Nuevo stock"
              inputMode="decimal"
              min="0"
              onChange={(evento) => setStockFinal(evento.target.value)}
              required
              step="0.001"
              type="number"
              value={stockFinal}
            />
            <small>
              Indica el saldo final. El sistema registrará la diferencia como
              ajuste.
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
          <div className="modulo-operativo__acciones modulo-operativo__acciones--dialogo modulo-operativo__ancho-completo">
            <button
              className="modulo-operativo__boton-secundario"
              disabled={guardando}
              onClick={() => setAbierto(false)}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="boton-principal"
              disabled={guardando}
              type="submit"
            >
              {guardando ? "Guardando…" : "Guardar ajuste"}
            </button>
          </div>
        </form>
      </DialogoModal>
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
