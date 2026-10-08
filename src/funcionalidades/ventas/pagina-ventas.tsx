"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import type {
  ClienteVenta,
  LineaVenta,
  ProductoVenta,
  Venta,
} from "./consultas";

type Propiedades = {
  ventas: Venta[];
  clientes: ClienteVenta[];
  productos: ProductoVenta[];
  usuarioId: string;
  esAdministrador: boolean;
  errorInicial: string | null;
};

type LineaBorrador = {
  producto: ProductoVenta;
  cantidad: string;
};

export function PaginaVentas({
  ventas,
  clientes,
  productos,
  usuarioId,
  esAdministrador,
  errorInicial,
}: Propiedades) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [ventaEditada, setVentaEditada] = useState<Venta | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [productoSeleccionado, setProductoSeleccionado] = useState("");
  const [cantidadProducto, setCantidadProducto] = useState("1");
  const [lineas, setLineas] = useState<LineaBorrador[]>([]);
  const [operacionId, setOperacionId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState(errorInicial);
  const monedas = useMemo(
    () =>
      new Map(
        productos.map((p) => [`${p.productoId}|${p.combinacionId ?? ""}`, p]),
      ),
    [productos],
  );

  function abrirNueva() {
    setVentaEditada(null);
    setClienteId("");
    setProductoSeleccionado("");
    setCantidadProducto("1");
    setLineas([]);
    setError(null);
    setAbierto(true);
  }

  function abrirEdicion(venta: Venta) {
    setVentaEditada(venta);
    setClienteId(venta.clienteId ?? "");
    setLineas(
      venta.lineas.map((linea) => ({
        producto:
          monedas.get(`${linea.productoId}|${linea.combinacionId ?? ""}`) ??
          desdeLinea(linea),
        cantidad: String(linea.cantidad),
      })),
    );
    const primeraLinea = venta.lineas[0];
    setProductoSeleccionado(
      primeraLinea
        ? `${primeraLinea.productoId}|${primeraLinea.combinacionId ?? ""}`
        : "",
    );
    setCantidadProducto("1");
    setError(null);
    setAbierto(true);
  }

  function agregarProducto() {
    setError(null);
    const producto = productos.find(
      (item) =>
        `${item.productoId}|${item.combinacionId ?? ""}` ===
        productoSeleccionado,
    );
    const cantidad = Number(cantidadProducto);
    if (!producto || !Number.isFinite(cantidad) || cantidad <= 0) {
      setError("Selecciona un producto y escribe una cantidad mayor que cero.");
      return;
    }
    setLineas((actuales) => [
      ...actuales,
      { producto, cantidad: String(cantidad) },
    ]);
    setCantidadProducto("1");
  }

  async function guardarBorrador(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setMensaje(null);
    const lineasValidas = lineas
      .map(({ producto, cantidad }) => ({
        producto_id: producto.productoId,
        combinacion_id: producto.combinacionId,
        cantidad: Number(cantidad),
      }))
      .filter((linea) => Number.isFinite(linea.cantidad) && linea.cantidad > 0);
    if (lineasValidas.length === 0) {
      setError("Agrega al menos un producto para guardar el borrador.");
      return;
    }
    if (lineasValidas.length !== lineas.length) {
      setError("Las cantidades deben ser mayores que cero.");
      return;
    }

    setOperacionId(ventaEditada?.id ?? "nueva");
    const { error: errorGuardar } = await crearClienteSupabase().rpc(
      "crear_borrador_venta",
      {
        cliente_objetivo: clienteId || null,
        lineas: lineasValidas,
        venta_objetivo: ventaEditada?.id ?? null,
      },
    );
    setOperacionId(null);
    if (errorGuardar) {
      setError(traducirError(errorGuardar.message));
      return;
    }
    setAbierto(false);
    setMensaje(
      ventaEditada
        ? "El borrador se actualizó."
        : "El borrador quedó guardado. No se descontó inventario.",
    );
    router.refresh();
  }

  async function confirmar(venta: Venta) {
    if (
      !window.confirm(
        `¿Confirmas la venta por ${formatearImporte(venta.total, venta.moneda)}? Se actualizarán las existencias.`,
      )
    )
      return;
    setError(null);
    setMensaje(null);
    setOperacionId(venta.id);
    const { error: errorConfirmar } = await crearClienteSupabase().rpc(
      "confirmar_venta",
      { venta_objetivo: venta.id },
    );
    setOperacionId(null);
    if (errorConfirmar) {
      setError(traducirError(errorConfirmar.message));
      return;
    }
    setMensaje("La venta quedó confirmada y el inventario se actualizó.");
    router.refresh();
  }

  async function descartar(venta: Venta) {
    if (
      !window.confirm(
        "¿Descartas este borrador? Esta acción no se puede deshacer.",
      )
    )
      return;
    setError(null);
    setOperacionId(venta.id);
    const { error: errorDescartar } = await crearClienteSupabase().rpc(
      "descartar_borrador_venta",
      { venta_objetivo: venta.id },
    );
    setOperacionId(null);
    if (errorDescartar) {
      setError(traducirError(errorDescartar.message));
      return;
    }
    setMensaje("El borrador se descartó.");
    router.refresh();
  }

  return (
    <section className="modulo-operativo">
      <header className="encabezado-seccion">
        <div>
          <p className="rotulo">OPERACIÓN DE VENTA</p>
          <h1>Ventas</h1>
          <p className="encabezado-seccion__texto">
            Guarda un borrador y confirma cuando los productos y cantidades
            estén listos.
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
        <p>{ventas.length} ventas visibles</p>
        <button className="boton-principal" onClick={abrirNueva} type="button">
          Nueva venta
        </button>
      </div>

      <div className="modulo-operativo__tabla-contenedor">
        <table className="modulo-operativo__tabla">
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Cliente</th>
              <th scope="col">Estado</th>
              <th scope="col">Total</th>
              <th scope="col">Productos</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((venta) => {
              const propia = venta.creadoPor === usuarioId;
              const editable =
                venta.estado === "borrador" && (esAdministrador || propia);
              return (
                <tr key={venta.id}>
                  <td>
                    {formatearFecha(venta.confirmadoEn ?? venta.creadoEn)}
                  </td>
                  <td>{venta.clienteNombre ?? "Venta de mostrador"}</td>
                  <td>
                    <span
                      className={`modulo-operativo__estado modulo-operativo__estado--${venta.estado}`}
                    >
                      {etiquetaEstado(venta.estado)}
                    </span>
                  </td>
                  <td>{formatearImporte(venta.total, venta.moneda)}</td>
                  <td>{venta.lineas.length}</td>
                  <td>
                    {editable ? (
                      <>
                        <button
                          aria-label="Editar borrador"
                          className="modulo-operativo__boton-texto"
                          onClick={() => abrirEdicion(venta)}
                          type="button"
                        >
                          Editar borrador
                        </button>
                        <button
                          aria-label="Confirmar venta"
                          className="modulo-operativo__boton-texto"
                          disabled={operacionId === venta.id}
                          onClick={() => void confirmar(venta)}
                          type="button"
                        >
                          Confirmar venta
                        </button>
                        <button
                          aria-label="Descartar borrador"
                          className="modulo-operativo__boton-texto"
                          disabled={operacionId === venta.id}
                          onClick={() => void descartar(venta)}
                          type="button"
                        >
                          Descartar
                        </button>
                      </>
                    ) : venta.estado === "confirmada" ? (
                      <Link
                        className="modulo-operativo__boton-texto"
                        href="/panel/facturacion"
                      >
                        Facturar
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {ventas.length === 0 ? (
          <div className="modulo-operativo__vacio" role="status">
            <strong>Aún no hay ventas</strong>
            <span>
              Inicia una venta cuando tengas los productos y cantidades.
            </span>
          </div>
        ) : null}
      </div>

      {abierto ? (
        <div className="modulo-operativo__dialogo-fondo">
          <section
            aria-labelledby="formulario-venta-titulo"
            aria-modal="true"
            className="modulo-operativo__dialogo"
            role="dialog"
          >
            <h2 id="formulario-venta-titulo">
              {ventaEditada ? "Editar borrador" : "Nueva venta"}
            </h2>
            <form
              className="modulo-operativo__formulario"
              onSubmit={guardarBorrador}
            >
              <label className="campo modulo-operativo__ancho-completo">
                <span>Cliente</span>
                <select
                  onChange={(evento) => setClienteId(evento.target.value)}
                  value={clienteId}
                >
                  <option value="">Venta de mostrador, sin cliente</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nombre}
                      {cliente.documento ? ` · ${cliente.documento}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Producto</span>
                <select
                  onChange={(evento) =>
                    setProductoSeleccionado(evento.target.value)
                  }
                  required
                  value={productoSeleccionado}
                >
                  <option value="">Selecciona un producto</option>
                  {productos.map((producto) => (
                    <option
                      key={`${producto.productoId}|${producto.combinacionId ?? ""}`}
                      value={`${producto.productoId}|${producto.combinacionId ?? ""}`}
                    >
                      {producto.sku} — {producto.descripcion}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Cantidad</span>
                <input
                  min="0.001"
                  onChange={(evento) =>
                    setCantidadProducto(evento.target.value)
                  }
                  required
                  step="0.001"
                  type="number"
                  value={cantidadProducto}
                />
              </label>
              <div className="modulo-operativo__ancho-completo">
                <button
                  className="modulo-operativo__boton-secundario"
                  onClick={agregarProducto}
                  type="button"
                >
                  Agregar producto
                </button>
              </div>
              {lineas.length ? (
                <div className="modulo-operativo__tabla-contenedor modulo-operativo__ancho-completo">
                  <table className="modulo-operativo__tabla">
                    <thead>
                      <tr>
                        <th scope="col">Producto</th>
                        <th scope="col">Cantidad</th>
                        <th scope="col">Precio de referencia</th>
                        <th scope="col">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((linea, indice) => (
                        <tr key={`${linea.producto.productoId}-${indice}`}>
                          <td>{linea.producto.descripcion}</td>
                          <td>
                            <label className="campo">
                              <span className="sr-only">
                                Cantidad de producto {indice + 1}
                              </span>
                              <input
                                aria-label={`Cantidad de producto ${indice + 1}`}
                                min="0.001"
                                onChange={(evento) =>
                                  setLineas((actuales) =>
                                    actuales.map((item, posicion) =>
                                      posicion === indice
                                        ? {
                                            ...item,
                                            cantidad: evento.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                required
                                step="0.001"
                                type="number"
                                value={linea.cantidad}
                              />
                            </label>
                          </td>
                          <td>
                            {formatearImporte(linea.producto.precio, "PEN")}
                          </td>
                          <td>
                            <button
                              aria-label={`Quitar producto ${indice + 1}`}
                              className="modulo-operativo__boton-texto"
                              onClick={() =>
                                setLineas((actuales) =>
                                  actuales.filter(
                                    (_, posicion) => posicion !== indice,
                                  ),
                                )
                              }
                              type="button"
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="modulo-operativo__aviso modulo-operativo__ancho-completo">
                  Agrega al menos un producto. El total y los impuestos los
                  calcula el servidor al guardar.
                </p>
              )}
              <p className="modulo-operativo__ancho-completo modulo-operativo__nota">
                El servidor vuelve a validar precios, impuestos y existencias
                antes de confirmar.
              </p>
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
                  disabled={Boolean(operacionId)}
                  type="submit"
                >
                  {operacionId
                    ? "Guardando…"
                    : ventaEditada
                      ? "Guardar cambios"
                      : "Guardar borrador"}
                </button>
                <button
                  className="modulo-operativo__boton-secundario"
                  disabled={Boolean(operacionId)}
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

function desdeLinea(linea: LineaVenta): ProductoVenta {
  return {
    productoId: linea.productoId,
    combinacionId: linea.combinacionId,
    sku: linea.sku,
    descripcion: linea.descripcion,
    precio: linea.precioUnitario,
    unidadMedida: linea.unidadMedida,
  };
}

function traducirError(mensaje: string): string {
  if (mensaje.includes("existencias suficientes"))
    return "No hay existencias suficientes para confirmar la venta.";
  if (mensaje.includes("precio de un producto cambió"))
    return "El precio cambió desde que guardaste el borrador. Actualízalo antes de confirmar.";
  if (mensaje.includes("impuestos cambió"))
    return "La configuración de impuestos cambió. Actualiza el borrador antes de confirmar.";
  if (mensaje.includes("borrador")) return mensaje;
  if (mensaje.includes("producto") || mensaje.includes("combinación"))
    return mensaje;
  return "No se pudo completar la operación. Revisa el borrador e inténtalo de nuevo.";
}

function etiquetaEstado(estado: string): string {
  return estado === "confirmada"
    ? "Confirmada"
    : estado === "descartada"
      ? "Descartada"
      : "Borrador";
}

function formatearImporte(importe: number, moneda: string): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: moneda,
  }).format(importe);
}

function formatearFecha(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(fecha));
}
