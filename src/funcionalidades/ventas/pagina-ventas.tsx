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
import type { TipoComprobante } from "@/funcionalidades/facturacion/consultas";
import { emitirComprobante } from "@/funcionalidades/facturacion/emision";
import { enlacePdfSeguro } from "@/funcionalidades/facturacion/enlace-pdf";
import { DialogoConfirmacion } from "@/compartido/componentes/dialogo-confirmacion";

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
  const [ventaAConfirmar, setVentaAConfirmar] = useState<Venta | null>(null);
  const [ventaADescartar, setVentaADescartar] = useState<Venta | null>(null);
  const [tipoComprobante, setTipoComprobante] =
    useState<TipoComprobante>("boleta");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState(errorInicial);
  const monedas = useMemo(
    () =>
      new Map(
        productos.map((p) => [`${p.productoId}|${p.combinacionId ?? ""}`, p]),
      ),
    [productos],
  );
  const clienteSeleccionado = clientes.find(
    (cliente) => cliente.id === clienteId,
  );
  const facturaDisponible =
    clienteSeleccionado?.tipoDocumento === "ruc" &&
    Boolean(clienteSeleccionado.documento);
  const facturaDisponibleConfirmacion =
    ventaAConfirmar?.clienteTipoDocumento === "ruc" &&
    Boolean(ventaAConfirmar.clienteNumeroDocumento);

  function abrirNueva() {
    setVentaEditada(null);
    setClienteId("");
    setProductoSeleccionado("");
    setCantidadProducto("1");
    setLineas([]);
    setTipoComprobante("boleta");
    setError(null);
    setAbierto(true);
  }

  function abrirEdicion(venta: Venta) {
    setVentaEditada(venta);
    setClienteId(venta.clienteId ?? "");
    setTipoComprobante(venta.tipoComprobante ?? "boleta");
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
    if (!clienteId) {
      setError("Selecciona un cliente para guardar la venta.");
      return;
    }

    setOperacionId(ventaEditada?.id ?? "nueva");
    const { error: errorGuardar } = await crearClienteSupabase().rpc(
      "crear_borrador_venta_con_comprobante",
      {
        cliente_objetivo: clienteId,
        lineas: lineasValidas,
        tipo_comprobante_solicitado: tipoComprobante,
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
    setVentaAConfirmar(venta);
    setTipoComprobante(venta.tipoComprobante ?? "boleta");
    setError(null);
    setMensaje(null);
  }

  async function confirmarYEmitir() {
    if (!ventaAConfirmar) return;
    const venta = ventaAConfirmar;
    setError(null);
    setMensaje(null);
    setOperacionId(venta.id);
    const supabase = crearClienteSupabase();
    let errorConfirmar: { message: string } | null;
    try {
      const resultado = await supabase.rpc("confirmar_venta_con_comprobante", {
        venta_objetivo: venta.id,
        tipo_comprobante_solicitado: tipoComprobante,
      });
      errorConfirmar = resultado.error;
    } catch {
      setOperacionId(null);
      setVentaAConfirmar(null);
      setError(
        "No se recibió respuesta al confirmar. Revisa la venta y, si ya está confirmada, usa la acción para completar o reintentar el envío.",
      );
      router.refresh();
      return;
    }
    if (errorConfirmar) {
      setOperacionId(null);
      setError(traducirError(errorConfirmar.message));
      return;
    }

    setVentaAConfirmar(null);
    setMensaje(`Venta confirmada. Enviando ${tipoComprobante} a NubeFacT…`);
    try {
      const respuesta = await emitirComprobante(
        supabase,
        venta.id,
        tipoComprobante,
      );
      setMensaje(
        respuesta.estado === "emitido"
          ? tipoComprobante === "boleta"
            ? "Venta confirmada y boleta enviada a NubeFacT. La aceptación de SUNAT se consultará después."
            : respuesta.aceptadaPorSunat
              ? "Venta confirmada y factura aceptada por SUNAT."
              : "Venta confirmada y factura enviada a NubeFacT. La respuesta de SUNAT sigue pendiente."
          : "Venta confirmada. El comprobante sigue en proceso; puedes revisar su estado en Facturación.",
      );
      setError(null);
    } catch (errorEmision) {
      setMensaje("La venta quedó confirmada y el inventario se actualizó.");
      setError(
        `No se pudo completar el envío del comprobante: ${errorEmision instanceof Error ? errorEmision.message : "error de conexión"} Revisa Facturación para reintentar.`,
      );
    } finally {
      setOperacionId(null);
      router.refresh();
    }
  }

  async function descartar() {
    if (!ventaADescartar) return;
    const venta = ventaADescartar;
    setError(null);
    setOperacionId(venta.id);
    try {
      const { error: errorDescartar } = await crearClienteSupabase().rpc(
        "descartar_borrador_venta",
        { venta_objetivo: venta.id },
      );
      if (errorDescartar) {
        setError(traducirError(errorDescartar.message));
        return;
      }
      setVentaADescartar(null);
      setMensaje("El borrador se descartó.");
      router.refresh();
    } catch {
      setError(
        "No se pudo descartar el borrador. Revisa tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setOperacionId(null);
    }
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
              const enlacePdf = enlacePdfSeguro(venta.enlacePdf);
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
                          onClick={() => {
                            setError(null);
                            setVentaADescartar(venta);
                          }}
                          type="button"
                        >
                          Descartar
                        </button>
                      </>
                    ) : venta.estado === "confirmada" &&
                      !venta.estadoComprobante &&
                      !venta.tipoComprobante ? (
                      <button
                        className="modulo-operativo__boton-texto"
                        disabled={operacionId === venta.id}
                        onClick={() => void confirmar(venta)}
                        type="button"
                      >
                        Completar envío
                      </button>
                    ) : venta.estado === "confirmada" &&
                      venta.tipoComprobante &&
                      !venta.estadoComprobante ? (
                      <button
                        className="modulo-operativo__boton-texto"
                        disabled={operacionId === venta.id}
                        onClick={() => void confirmar(venta)}
                        type="button"
                      >
                        Reintentar comprobante
                      </button>
                    ) : venta.estado === "confirmada" ? (
                      enlacePdf ? (
                        <a
                          className="modulo-operativo__boton-texto"
                          href={enlacePdf}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Ver comprobante
                        </a>
                      ) : (
                        <Link
                          className="modulo-operativo__boton-texto"
                          href="/panel/facturacion"
                        >
                          Ver estado del comprobante
                        </Link>
                      )
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
              <fieldset className="modulo-operativo__opciones-comprobante modulo-operativo__ancho-completo">
                <legend>¿Qué comprobante se enviará al confirmar?</legend>
                <label>
                  <input
                    checked={tipoComprobante === "boleta"}
                    name="tipo-comprobante-venta"
                    onChange={() => setTipoComprobante("boleta")}
                    type="radio"
                  />
                  Boleta
                </label>
                <label>
                  <input
                    checked={tipoComprobante === "factura"}
                    disabled={!facturaDisponible}
                    name="tipo-comprobante-venta"
                    onChange={() => setTipoComprobante("factura")}
                    type="radio"
                  />
                  Factura
                </label>
                {!facturaDisponible ? (
                  <small className="modulo-operativo__ancho-completo">
                    Para emitir factura, selecciona un cliente con RUC válido.
                  </small>
                ) : null}
              </fieldset>
              <label className="campo modulo-operativo__ancho-completo">
                <span>Cliente</span>
                <select
                  onChange={(evento) => {
                    const id = evento.target.value;
                    setClienteId(id);
                    const cliente = clientes.find((item) => item.id === id);
                    if (
                      tipoComprobante === "factura" &&
                      (cliente?.tipoDocumento !== "ruc" || !cliente.documento)
                    ) {
                      setTipoComprobante("boleta");
                    }
                  }}
                  required
                  value={clienteId}
                >
                  <option value="">Selecciona un cliente</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nombre}
                      {cliente.documento ? ` · ${cliente.documento}` : ""}
                    </option>
                  ))}
                </select>
                {clientes.length === 0 ? (
                  <small>
                    Registra primero un cliente activo en{" "}
                    <Link href="/panel/clientes">Clientes</Link>.
                  </small>
                ) : null}
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
                Al confirmar, el sistema enviará esta venta como{" "}
                {tipoComprobante}. El servidor vuelve a validar precios,
                impuestos y existencias.
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

      {ventaAConfirmar ? (
        <div className="modulo-operativo__dialogo-fondo">
          <section
            aria-labelledby="confirmar-venta-titulo"
            aria-modal="true"
            className="modulo-operativo__dialogo"
            role="dialog"
          >
            <h2 id="confirmar-venta-titulo">
              {ventaAConfirmar.estado === "confirmada"
                ? "Completar envío del comprobante"
                : "Confirmar venta y emitir comprobante"}
            </h2>
            <p>
              {ventaAConfirmar.clienteNombre} ·{" "}
              {formatearImporte(ventaAConfirmar.total, ventaAConfirmar.moneda)}
            </p>
            <p>
              {ventaAConfirmar.estado === "confirmada"
                ? "La venta ya está confirmada; el inventario no volverá a cambiar. El sistema enviará inmediatamente el comprobante a NubeFacT."
                : "Al confirmar se actualizarán las existencias y el sistema enviará inmediatamente el comprobante a NubeFacT."}
            </p>
            {ventaAConfirmar.tipoComprobante ? (
              <p className="modulo-operativo__nota">
                Se enviará como {ventaAConfirmar.tipoComprobante}.
              </p>
            ) : (
              <fieldset className="modulo-operativo__opciones-comprobante">
                <legend>Tipo de comprobante</legend>
                <label>
                  <input
                    checked={tipoComprobante === "boleta"}
                    name="tipo-comprobante-confirmar"
                    onChange={() => setTipoComprobante("boleta")}
                    type="radio"
                  />
                  Boleta
                </label>
                <label>
                  <input
                    checked={tipoComprobante === "factura"}
                    disabled={!facturaDisponibleConfirmacion}
                    name="tipo-comprobante-confirmar"
                    onChange={() => setTipoComprobante("factura")}
                    type="radio"
                  />
                  Factura
                </label>
              </fieldset>
            )}
            {!facturaDisponibleConfirmacion ? (
              <p className="modulo-operativo__nota">
                La factura estará disponible cuando el cliente tenga un RUC
                válido registrado.
              </p>
            ) : null}
            {tipoComprobante === "boleta" &&
            ventaAConfirmar.total > 700 &&
            !ventaAConfirmar.clienteNumeroDocumento ? (
              <p className="modulo-operativo__nota">
                Esta boleta supera S/ 700 y requiere identificar al cliente.
              </p>
            ) : null}
            <div className="modulo-operativo__acciones">
              <button
                className="boton-principal"
                disabled={
                  Boolean(operacionId) ||
                  (tipoComprobante === "factura" &&
                    !facturaDisponibleConfirmacion) ||
                  (tipoComprobante === "boleta" &&
                    ventaAConfirmar.total > 700 &&
                    !ventaAConfirmar.clienteNumeroDocumento)
                }
                onClick={() => void confirmarYEmitir()}
                type="button"
              >
                {operacionId === ventaAConfirmar.id
                  ? "Confirmando y enviando…"
                  : "Confirmar y enviar"}
              </button>
              <button
                className="modulo-operativo__boton-secundario"
                disabled={Boolean(operacionId)}
                onClick={() => setVentaAConfirmar(null)}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <DialogoConfirmacion
        abierto={Boolean(ventaADescartar)}
        descripcion="El borrador quedará descartado y ya no se podrá editar. Esta acción no descontará existencias."
        error={ventaADescartar ? error : null}
        onCancelar={() => {
          if (!operacionId) setVentaADescartar(null);
        }}
        onConfirmar={descartar}
        procesando={Boolean(
          ventaADescartar && operacionId === ventaADescartar.id,
        )}
        textoCancelar="Seguir editando"
        textoConfirmar="Descartar borrador"
        titulo="¿Descartar este borrador?"
        variante="peligro"
      />
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
  if (
    mensaje.includes("RUC") ||
    mensaje.includes("serie activa") ||
    mensaje.includes("factura requiere") ||
    mensaje.includes("boletas mayores")
  )
    return mensaje;
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
