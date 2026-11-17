"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import { useNotificaciones } from "@/compartido/notificaciones/proveedor-notificaciones";
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
import { DialogoModal } from "@/compartido/componentes/dialogo-modal";
import { BotonLectorCodigo } from "@/compartido/componentes/lector-codigo";
import { documentoConsultable } from "@/funcionalidades/clientes/validaciones-documentos";

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

type OpcionComprobante = TipoComprobante | "boleta_simple";
type ClienteConsultado = {
  tipoDocumento: "dni" | "ruc";
  numeroDocumento: string;
  nombre: string;
  direccion: string | null;
};

function tipoComprobanteParaServidor(
  opcion: OpcionComprobante,
): TipoComprobante {
  return opcion === "boleta_simple" ? "boleta" : opcion;
}

function nombreComprobante(opcion: OpcionComprobante): string {
  return opcion === "boleta_simple" ? "boleta simple" : opcion;
}

function documentoValidoParaVenta(
  tipoDocumento: "dni" | "ruc",
  numero: string,
) {
  return (
    documentoConsultable(tipoDocumento, numero) &&
    (tipoDocumento !== "ruc" || ["10", "20"].includes(numero.slice(0, 2)))
  );
}

export function PaginaVentas({
  ventas,
  clientes,
  productos,
  usuarioId,
  esAdministrador,
  errorInicial,
}: Propiedades) {
  const router = useRouter();
  const notificaciones = useNotificaciones();
  const [abierto, setAbierto] = useState(false);
  const [ventaEditada, setVentaEditada] = useState<Venta | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [listaClientesAbierta, setListaClientesAbierta] = useState(false);
  const [clienteConsultado, setClienteConsultado] =
    useState<ClienteConsultado | null>(null);
  const [consultandoDocumento, setConsultandoDocumento] = useState(false);
  const [indiceClienteActivo, setIndiceClienteActivo] = useState(0);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [listaProductosAbierta, setListaProductosAbierta] = useState(false);
  const [indiceProductoActivo, setIndiceProductoActivo] = useState(0);
  const [productoSeleccionado, setProductoSeleccionado] = useState("");
  const [cantidadProducto, setCantidadProducto] = useState("1");
  const [lineas, setLineas] = useState<LineaBorrador[]>([]);
  const [operacionId, setOperacionId] = useState<string | null>(null);
  const [accionGuardado, setAccionGuardado] = useState<
    "borrador" | "confirmar"
  >("borrador");
  const [faseConfirmacion, setFaseConfirmacion] = useState<
    "confirmando" | "enviando" | null
  >(null);
  const [ventaAConfirmar, setVentaAConfirmar] = useState<Venta | null>(null);
  const [ventaADescartar, setVentaADescartar] = useState<Venta | null>(null);
  const [tipoComprobante, setTipoComprobante] =
    useState<OpcionComprobante>("boleta");
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
  const tipoDocumentoVenta = tipoComprobante === "factura" ? "ruc" : "dni";
  const clientesFiltrados = useMemo(() => {
    const consulta = busquedaCliente.trim().toLocaleLowerCase("es");
    return clientes.filter((cliente) => {
      const esTipoValido =
        tipoDocumentoVenta === "dni"
          ? cliente.tipoDocumento === "dni" &&
            Boolean(
              cliente.documento &&
              documentoValidoParaVenta("dni", cliente.documento),
            )
          : cliente.tipoDocumento === "ruc" &&
            Boolean(
              cliente.documento &&
              documentoValidoParaVenta("ruc", cliente.documento),
            );
      return (
        esTipoValido &&
        (!consulta ||
          `${cliente.nombre} ${cliente.documento ?? ""}`
            .toLocaleLowerCase("es")
            .includes(consulta))
      );
    });
  }, [busquedaCliente, clientes, tipoDocumentoVenta]);
  const productosFiltrados = useMemo(() => {
    const consulta = busquedaProducto.trim().toLocaleLowerCase("es");
    return productos.filter(
      (producto) =>
        !consulta ||
        `${producto.sku} ${producto.codigoBarras ?? ""} ${producto.descripcion}`
          .toLocaleLowerCase("es")
          .includes(consulta),
    );
  }, [busquedaProducto, productos]);
  const productoElegido = productos.find(
    (producto) =>
      `${producto.productoId}|${producto.combinacionId ?? ""}` ===
      productoSeleccionado,
  );
  const documentoPendienteValido = Boolean(
    clienteConsultado &&
    documentoValidoParaVenta(
      clienteConsultado.tipoDocumento,
      clienteConsultado.numeroDocumento,
    ),
  );
  const documentoSeleccionadoValido = Boolean(
    clienteSeleccionado &&
    clienteSeleccionado.tipoDocumento === tipoDocumentoVenta &&
    clienteSeleccionado.documento &&
    documentoValidoParaVenta(tipoDocumentoVenta, clienteSeleccionado.documento),
  );
  const documentoParaConsultar = busquedaCliente.replace(/[ .-]/g, "").trim();
  const consultaDisponible =
    !clienteId &&
    documentoValidoParaVenta(tipoDocumentoVenta, documentoParaConsultar) &&
    !clientesFiltrados.some(
      (cliente) => cliente.documento === documentoParaConsultar,
    );
  const facturaDisponibleConfirmacion =
    ventaAConfirmar?.clienteTipoDocumento === "ruc" &&
    Boolean(
      ventaAConfirmar.clienteNumeroDocumento &&
      documentoValidoParaVenta("ruc", ventaAConfirmar.clienteNumeroDocumento),
    );
  const boletaDisponibleConfirmacion = Boolean(
    ventaAConfirmar &&
    ventaAConfirmar.clienteId !== null &&
    ventaAConfirmar.clienteTipoDocumento === "dni" &&
    ventaAConfirmar.clienteNumeroDocumento &&
    documentoValidoParaVenta("dni", ventaAConfirmar.clienteNumeroDocumento),
  );

  function abrirNueva() {
    setVentaEditada(null);
    setClienteId("");
    setBusquedaCliente("");
    setListaClientesAbierta(false);
    setClienteConsultado(null);
    setIndiceClienteActivo(0);
    setBusquedaProducto("");
    setListaProductosAbierta(false);
    setIndiceProductoActivo(0);
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
    setBusquedaCliente("");
    setListaClientesAbierta(false);
    setClienteConsultado(null);
    setIndiceClienteActivo(0);
    setBusquedaProducto("");
    setListaProductosAbierta(false);
    setIndiceProductoActivo(0);
    setTipoComprobante(
      venta.tipoComprobante === "boleta" && venta.clienteId === null
        ? "boleta_simple"
        : (venta.tipoComprobante ?? "boleta"),
    );
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
    setProductoSeleccionado("");
    setBusquedaProducto("");
    setListaProductosAbierta(false);
    setIndiceProductoActivo(0);
    setCantidadProducto("1");
  }

  /**
   * Agrega una unidad del producto con ese código de barras (cámara o pistola).
   * Si ya está en la venta, aumenta su cantidad.
   */
  function agregarPorCodigo(codigoLeido: string) {
    const codigo = codigoLeido.trim();
    const coincidencias = productos.filter(
      (producto) => producto.codigoBarras === codigo,
    );
    setError(null);
    if (coincidencias.length === 0) {
      setBusquedaProducto("");
      setListaProductosAbierta(false);
      setError(`No hay ningún producto con el código ${codigo}.`);
      return;
    }
    if (coincidencias.length > 1) {
      // Producto con tallas o colores: se muestra la lista para elegir la variante.
      setProductoSeleccionado("");
      setBusquedaProducto(codigo);
      setListaProductosAbierta(true);
      setIndiceProductoActivo(0);
      return;
    }
    const producto = coincidencias[0];
    setLineas((actuales) => {
      const indice = actuales.findIndex(
        (linea) =>
          linea.producto.productoId === producto.productoId &&
          linea.producto.combinacionId === producto.combinacionId,
      );
      if (indice === -1) return [...actuales, { producto, cantidad: "1" }];
      return actuales.map((linea, posicion) =>
        posicion === indice
          ? { ...linea, cantidad: String(Number(linea.cantidad) + 1) }
          : linea,
      );
    });
    setProductoSeleccionado("");
    setBusquedaProducto("");
    setListaProductosAbierta(false);
    setIndiceProductoActivo(0);
    notificaciones.exito(`Se agregó ${producto.descripcion}.`);
  }

  function seleccionarCliente(id: string) {
    setClienteId(id);
    setBusquedaCliente("");
    setListaClientesAbierta(false);
    setClienteConsultado(null);
    setIndiceClienteActivo(0);
  }

  function seleccionarProducto(producto: ProductoVenta) {
    setProductoSeleccionado(
      `${producto.productoId}|${producto.combinacionId ?? ""}`,
    );
    setBusquedaProducto("");
    setListaProductosAbierta(false);
    setIndiceProductoActivo(0);
  }

  function cambiarTipoComprobante(tipo: OpcionComprobante) {
    setTipoComprobante(tipo);
    setClienteId("");
    setBusquedaCliente("");
    setListaClientesAbierta(false);
    setClienteConsultado(null);
    setIndiceClienteActivo(0);
  }

  async function consultarClientePorDocumento() {
    const numeroDocumento = documentoParaConsultar;
    if (!documentoValidoParaVenta(tipoDocumentoVenta, numeroDocumento)) {
      setError(
        tipoDocumentoVenta === "dni"
          ? "Escribe un DNI válido de ocho dígitos."
          : "Escribe un RUC válido de once dígitos que empiece por 10 o 20.",
      );
      return;
    }

    setError(null);
    setConsultandoDocumento(true);
    try {
      const respuesta = await fetch("/api/clientes/consultar-documento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipoDocumento: tipoDocumentoVenta,
          numeroDocumento,
        }),
      });
      const datos = (await respuesta.json()) as {
        nombre?: string;
        direccion?: string | null;
        error?: string;
      };
      if (!respuesta.ok || !datos.nombre?.trim()) {
        notificaciones.error(
          datos.error ?? "SUNAT no devolvió un nombre para este documento.",
        );
        return;
      }

      setClienteId("");
      setClienteConsultado({
        tipoDocumento: tipoDocumentoVenta,
        numeroDocumento,
        nombre: datos.nombre.trim(),
        direccion: datos.direccion?.trim() || null,
      });
      setListaClientesAbierta(false);
      notificaciones.exito(
        "Documento consultado. Se guardará con el borrador.",
      );
    } catch {
      notificaciones.error("No se pudo consultar SUNAT. Inténtalo nuevamente.");
    } finally {
      setConsultandoDocumento(false);
    }
  }

  async function guardarBorrador(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    const accion = (evento.nativeEvent as SubmitEvent).submitter;
    const confirmarAlGuardar =
      accion instanceof HTMLButtonElement && accion.value === "confirmar";
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
    if (
      tipoComprobante !== "boleta_simple" &&
      !documentoSeleccionadoValido &&
      !documentoPendienteValido
    ) {
      setError(
        tipoDocumentoVenta === "dni"
          ? "La boleta requiere un DNI válido. Busca un cliente o consulta el DNI en SUNAT."
          : "La factura requiere un RUC válido que empiece por 10 o 20. Busca un cliente o consulta el RUC en SUNAT.",
      );
      return;
    }

    setAccionGuardado(confirmarAlGuardar ? "confirmar" : "borrador");
    setOperacionId(ventaEditada?.id ?? "nueva");
    const supabase = crearClienteSupabase();
    const resultado =
      tipoComprobante === "boleta_simple"
        ? await supabase.rpc("crear_borrador_venta_con_comprobante", {
            cliente_objetivo: null,
            lineas: lineasValidas,
            tipo_comprobante_solicitado: "boleta",
            venta_objetivo: ventaEditada?.id ?? null,
          })
        : clienteConsultado && !clienteId
          ? await supabase.rpc("crear_borrador_venta_con_documento", {
              tipo_documento_cliente: clienteConsultado.tipoDocumento,
              numero_documento_cliente: clienteConsultado.numeroDocumento,
              nombre_cliente: clienteConsultado.nombre,
              direccion_cliente: clienteConsultado.direccion,
              lineas: lineasValidas,
              tipo_comprobante_solicitado: tipoComprobante,
              venta_objetivo: ventaEditada?.id ?? null,
            })
          : await supabase.rpc("crear_borrador_venta_con_comprobante", {
              cliente_objetivo: clienteId,
              lineas: lineasValidas,
              tipo_comprobante_solicitado: tipoComprobante,
              venta_objetivo: ventaEditada?.id ?? null,
            });
    if (resultado.error) {
      setOperacionId(null);
      notificaciones.error(traducirError(resultado.error.message));
      return;
    }

    if (confirmarAlGuardar) {
      if (typeof resultado.data !== "string") {
        setOperacionId(null);
        setAbierto(false);
        setVentaEditada(null);
        notificaciones.error(
          "El borrador se guardó, pero no se pudo abrir la confirmación. Busca la venta en la lista para continuar.",
        );
        router.refresh();
        return;
      }

      const { data: datosVenta, error: errorVenta } = await supabase
        .from("ventas")
        .select(
          "id, cliente_id, cliente_nombre, cliente_tipo_documento, cliente_numero_documento, estado, moneda, subtotal, igv, total, creado_en, confirmado_en, creado_por, tipo_comprobante",
        )
        .eq("id", resultado.data)
        .single();

      setOperacionId(null);
      if (errorVenta || !datosVenta) {
        setAbierto(false);
        setVentaEditada(null);
        notificaciones.error(
          "El borrador se guardó, pero no se pudo abrir la confirmación. Busca la venta en la lista para continuar.",
        );
        router.refresh();
        return;
      }

      const ventaGuardada: Venta = {
        id: datosVenta.id,
        clienteId: datosVenta.cliente_id,
        clienteNombre: datosVenta.cliente_nombre,
        clienteTipoDocumento: datosVenta.cliente_tipo_documento,
        clienteNumeroDocumento: datosVenta.cliente_numero_documento,
        estado: datosVenta.estado,
        moneda: datosVenta.moneda,
        subtotal: Number(datosVenta.subtotal),
        igv: Number(datosVenta.igv),
        total: Number(datosVenta.total),
        creadoEn: datosVenta.creado_en,
        confirmadoEn: datosVenta.confirmado_en,
        creadoPor: datosVenta.creado_por,
        tipoComprobante:
          datosVenta.tipo_comprobante === "boleta" ||
          datosVenta.tipo_comprobante === "factura"
            ? datosVenta.tipo_comprobante
            : null,
        origen: "registrada",
        comprobanteId: null,
        estadoComprobante: null,
        enlacePdf: null,
        lineas: [],
      };
      setAbierto(false);
      setVentaEditada(null);
      setVentaAConfirmar(ventaGuardada);
      setTipoComprobante(
        ventaGuardada.tipoComprobante === "boleta" &&
          ventaGuardada.clienteId === null
          ? "boleta_simple"
          : (ventaGuardada.tipoComprobante ?? "boleta"),
      );
      router.refresh();
      return;
    }

    setOperacionId(null);
    setAbierto(false);
    notificaciones.exito(
      ventaEditada
        ? "El borrador se actualizó."
        : "El borrador quedó guardado. No se descontó inventario.",
    );
    router.refresh();
  }

  async function confirmar(venta: Venta) {
    setVentaAConfirmar(venta);
    setTipoComprobante(
      venta.tipoComprobante === "boleta" && venta.clienteId === null
        ? "boleta_simple"
        : (venta.tipoComprobante ?? "boleta"),
    );
    setError(null);
  }

  async function confirmarYEmitir() {
    if (!ventaAConfirmar) return;
    const venta = ventaAConfirmar;
    setError(null);
    setOperacionId(venta.id);
    setFaseConfirmacion("confirmando");
    const supabase = crearClienteSupabase();
    let errorConfirmar: { message: string } | null;
    try {
      const resultado = await supabase.rpc("confirmar_venta_con_comprobante", {
        venta_objetivo: venta.id,
        tipo_comprobante_solicitado:
          tipoComprobanteParaServidor(tipoComprobante),
      });
      errorConfirmar = resultado.error;
    } catch {
      setOperacionId(null);
      setFaseConfirmacion(null);
      setVentaAConfirmar(null);
      notificaciones.error(
        "No se recibió respuesta al confirmar. Revisa la venta y, si ya está confirmada, usa la acción para completar o reintentar el envío.",
      );
      router.refresh();
      return;
    }
    if (errorConfirmar) {
      setOperacionId(null);
      setFaseConfirmacion(null);
      notificaciones.error(traducirError(errorConfirmar.message));
      return;
    }

    setFaseConfirmacion("enviando");
    try {
      const respuesta = await emitirComprobante(
        supabase,
        venta.id,
        tipoComprobanteParaServidor(tipoComprobante),
      );
      notificaciones.exito(
        respuesta.estado === "emitido"
          ? tipoComprobanteParaServidor(tipoComprobante) === "boleta"
            ? "Venta confirmada y boleta enviada a NubeFacT. La aceptación de SUNAT se consultará después."
            : respuesta.aceptadaPorSunat
              ? "Venta confirmada y factura aceptada por SUNAT."
              : "Venta confirmada y factura enviada a NubeFacT. La respuesta de SUNAT sigue pendiente."
          : "Venta confirmada. El comprobante sigue en proceso; puedes revisar su estado en Facturación.",
      );
    } catch (errorEmision) {
      notificaciones.error(
        `La venta quedó confirmada y el inventario se actualizó, pero no se pudo completar el envío del comprobante: ${errorEmision instanceof Error ? errorEmision.message : "error de conexión"} Revisa Facturación para reintentar.`,
      );
    } finally {
      setOperacionId(null);
      setFaseConfirmacion(null);
      setVentaAConfirmar(null);
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
        notificaciones.error(traducirError(errorDescartar.message));
        return;
      }
      setVentaADescartar(null);
      notificaciones.exito("El borrador se descartó.");
      router.refresh();
    } catch {
      notificaciones.error(
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
                  <td data-etiqueta="Fecha">
                    {formatearFecha(venta.confirmadoEn ?? venta.creadoEn)}
                  </td>
                  <td data-etiqueta="Cliente" data-principal>
                    {venta.clienteNombre ?? "Venta de mostrador"}
                  </td>
                  <td data-etiqueta="Estado">
                    <span className="insignias">
                      <span
                        className={`modulo-operativo__estado modulo-operativo__estado--${venta.estado}`}
                      >
                        {etiquetaEstado(venta.estado)}
                      </span>
                      {venta.origen === "simulada" ? (
                        <span
                          className="estado estado--info"
                          title="Historial simulado del dataset APF3; no es una venta real."
                        >
                          Simulada
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td data-etiqueta="Total">
                    {formatearImporte(venta.total, venta.moneda)}
                  </td>
                  <td data-etiqueta="Productos">{venta.lineas.length}</td>
                  <td data-etiqueta="Acciones" data-acciones>
                    {venta.origen === "simulada" ? (
                      <small className="modulo-operativo__detalle">
                        Sin comprobante
                      </small>
                    ) : editable ? (
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
                      <>
                        {venta.estadoComprobante === "emitido" &&
                        venta.comprobanteId ? (
                          <a
                            className="modulo-operativo__boton-texto"
                            href={`/api/comprobantes/${venta.comprobanteId}/pdf`}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            Ver comprobante
                          </a>
                        ) : enlacePdf &&
                          venta.estadoComprobante !== "emitido" ? (
                          <a
                            className="modulo-operativo__boton-texto"
                            href={enlacePdf}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            Ver PDF de NubeFacT
                          </a>
                        ) : null}
                        {venta.estadoComprobante === "emitido" &&
                        venta.comprobanteId ? (
                          <Link
                            className="modulo-operativo__boton-texto"
                            href={`/panel/facturacion#comprobante-${venta.comprobanteId}`}
                          >
                            Consultar comprobante
                          </Link>
                        ) : venta.estadoComprobante !== "emitido" ? (
                          <Link
                            className="modulo-operativo__boton-texto"
                            href="/panel/facturacion"
                          >
                            Ver estado del comprobante
                          </Link>
                        ) : null}
                      </>
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

      <DialogoModal
        abierto={abierto}
        bloqueado={Boolean(operacionId)}
        onCerrar={() => setAbierto(false)}
        titulo={ventaEditada ? "Editar borrador" : "Nueva venta"}
      >
        <form
          className="modulo-operativo__formulario"
          onSubmit={guardarBorrador}
        >
          <fieldset className="modulo-operativo__opciones-comprobante modulo-operativo__ancho-completo">
            <legend>¿Qué comprobante se enviará al confirmar?</legend>
            <label>
              <input
                checked={tipoComprobante === "boleta"}
                disabled={consultandoDocumento}
                name="tipo-comprobante-venta"
                onChange={() => cambiarTipoComprobante("boleta")}
                type="radio"
              />
              Boleta
            </label>
            <label>
              <input
                checked={tipoComprobante === "factura"}
                disabled={consultandoDocumento}
                name="tipo-comprobante-venta"
                onChange={() => cambiarTipoComprobante("factura")}
                type="radio"
              />
              Factura
            </label>
            <label>
              <input
                checked={tipoComprobante === "boleta_simple"}
                disabled={consultandoDocumento}
                name="tipo-comprobante-venta"
                onChange={() => cambiarTipoComprobante("boleta_simple")}
                type="radio"
              />
              Boleta simple
            </label>
          </fieldset>
          {tipoComprobante === "boleta_simple" ? (
            <p className="modulo-operativo__nota modulo-operativo__ancho-completo">
              Se emitirá sin asignar cliente para totales menores de S/ 700.
              Desde S/ 700 exactos, se requiere identificar al comprador: cambia
              a Boleta y selecciona un cliente con DNI antes de confirmar.
            </p>
          ) : (
            <div className="campo modulo-operativo__ancho-completo">
              <label htmlFor="busqueda-cliente-venta">
                {tipoComprobante === "factura"
                  ? "RUC del cliente"
                  : "DNI del cliente"}
              </label>
              {clienteSeleccionado ? (
                <span className="modulo-operativo__cliente-seleccionado">
                  <span>
                    <strong>{clienteSeleccionado.nombre}</strong>
                    {clienteSeleccionado.documento ? (
                      <small>{clienteSeleccionado.documento}</small>
                    ) : null}
                  </span>
                  <button
                    aria-label="Quitar cliente seleccionado"
                    className="modulo-operativo__cliente-quitar"
                    onClick={() => {
                      setClienteId("");
                      setClienteConsultado(null);
                      setBusquedaCliente("");
                      setListaClientesAbierta(false);
                    }}
                    type="button"
                  >
                    Quitar
                  </button>
                </span>
              ) : null}
              {clienteConsultado ? (
                <div
                  className="modulo-operativo__cliente-seleccionado"
                  role="status"
                >
                  <span>
                    <strong>{clienteConsultado.nombre}</strong>
                    <small>
                      {clienteConsultado.tipoDocumento.toUpperCase()} ·{" "}
                      {clienteConsultado.numeroDocumento} · Consultado en SUNAT
                    </small>
                  </span>
                  <button
                    aria-label="Quitar documento consultado"
                    className="modulo-operativo__cliente-quitar"
                    onClick={() => setClienteConsultado(null)}
                    type="button"
                  >
                    Quitar
                  </button>
                </div>
              ) : null}
              <input
                aria-activedescendant={
                  listaClientesAbierta && clientesFiltrados[indiceClienteActivo]
                    ? `cliente-venta-opcion-${indiceClienteActivo}`
                    : undefined
                }
                aria-autocomplete="list"
                aria-controls="cliente-venta-opciones"
                aria-expanded={listaClientesAbierta}
                autoComplete="off"
                disabled={consultandoDocumento}
                id="busqueda-cliente-venta"
                onChange={(evento) => {
                  setClienteId("");
                  setClienteConsultado(null);
                  setBusquedaCliente(evento.target.value);
                  setListaClientesAbierta(true);
                  setIndiceClienteActivo(0);
                }}
                onFocus={() => setListaClientesAbierta(true)}
                onBlur={() => setListaClientesAbierta(false)}
                onKeyDown={(evento) => {
                  if (evento.key === "Escape") {
                    setListaClientesAbierta(false);
                  } else if (
                    listaClientesAbierta &&
                    evento.key === "ArrowDown"
                  ) {
                    evento.preventDefault();
                    setIndiceClienteActivo((indice) =>
                      Math.min(indice + 1, clientesFiltrados.length - 1),
                    );
                  } else if (listaClientesAbierta && evento.key === "ArrowUp") {
                    evento.preventDefault();
                    setIndiceClienteActivo((indice) => Math.max(indice - 1, 0));
                  } else if (listaClientesAbierta && evento.key === "Enter") {
                    const cliente = clientesFiltrados[indiceClienteActivo];
                    if (cliente) {
                      evento.preventDefault();
                      seleccionarCliente(cliente.id);
                    }
                  }
                }}
                placeholder={`Buscar cliente por nombre o ${tipoDocumentoVenta.toUpperCase()}`}
                role="combobox"
                type="search"
                value={busquedaCliente}
              />
              {consultaDisponible ? (
                <button
                  className="modulo-operativo__boton-secundario"
                  disabled={consultandoDocumento}
                  onClick={() => void consultarClientePorDocumento()}
                  type="button"
                >
                  {consultandoDocumento
                    ? "Consultando SUNAT…"
                    : `Consultar ${tipoDocumentoVenta.toUpperCase()} en SUNAT`}
                </button>
              ) : null}
              {listaClientesAbierta ? (
                <div
                  className="modulo-operativo__lista-clientes"
                  id="cliente-venta-opciones"
                  role="listbox"
                  aria-label="Clientes disponibles"
                >
                  {clientesFiltrados.length > 0 ? (
                    clientesFiltrados.map((cliente, indice) => (
                      <button
                        aria-selected={cliente.id === clienteId}
                        className={
                          indice === indiceClienteActivo
                            ? "modulo-operativo__opcion-cliente modulo-operativo__opcion-cliente--activa"
                            : "modulo-operativo__opcion-cliente"
                        }
                        id={`cliente-venta-opcion-${indice}`}
                        key={cliente.id}
                        disabled={consultandoDocumento}
                        onClick={() => seleccionarCliente(cliente.id)}
                        onMouseEnter={() => setIndiceClienteActivo(indice)}
                        onMouseDown={(evento) => evento.preventDefault()}
                        role="option"
                        tabIndex={-1}
                        type="button"
                      >
                        <strong>{cliente.nombre}</strong>
                        <small>{cliente.documento}</small>
                      </button>
                    ))
                  ) : (
                    <p className="modulo-operativo__clientes-sin-resultados">
                      {clientes.length === 0
                        ? "Aún no hay clientes con este tipo de documento."
                        : "No hay coincidencias. Escribe un DNI o RUC válido para consultarlo en SUNAT."}
                    </p>
                  )}
                </div>
              ) : null}
              <small>
                {tipoComprobante === "factura"
                  ? "La factura requiere RUC de 11 dígitos que empiece por 10 o 20."
                  : "La boleta requiere DNI de 8 dígitos. El cliente se guarda al crear el borrador."}
              </small>
            </div>
          )}
          <div className="campo">
            <label htmlFor="busqueda-producto-venta">Producto</label>
            {productoElegido ? (
              <span className="modulo-operativo__producto-seleccionado">
                <span>
                  <strong>{productoElegido.descripcion}</strong>
                  <small>{productoElegido.sku}</small>
                </span>
                <button
                  aria-label="Quitar producto seleccionado"
                  className="modulo-operativo__producto-quitar"
                  onClick={() => setProductoSeleccionado("")}
                  type="button"
                >
                  Quitar
                </button>
              </span>
            ) : null}
            <div className="campo-con-lector">
              <input
                aria-activedescendant={
                  listaProductosAbierta &&
                  productosFiltrados[indiceProductoActivo]
                    ? `producto-venta-opcion-${indiceProductoActivo}`
                    : undefined
                }
                aria-autocomplete="list"
                aria-controls="producto-venta-opciones"
                aria-expanded={listaProductosAbierta}
                autoComplete="off"
                id="busqueda-producto-venta"
                onChange={(evento) => {
                  setProductoSeleccionado("");
                  setBusquedaProducto(evento.target.value);
                  setListaProductosAbierta(true);
                  setIndiceProductoActivo(0);
                }}
                onFocus={() => setListaProductosAbierta(true)}
                onBlur={() => setListaProductosAbierta(false)}
                onKeyDown={(evento) => {
                  if (evento.key === "Escape") {
                    setListaProductosAbierta(false);
                  } else if (
                    listaProductosAbierta &&
                    evento.key === "ArrowDown" &&
                    productosFiltrados.length > 0
                  ) {
                    evento.preventDefault();
                    setIndiceProductoActivo((indice) =>
                      Math.min(indice + 1, productosFiltrados.length - 1),
                    );
                  } else if (
                    listaProductosAbierta &&
                    evento.key === "ArrowUp" &&
                    productosFiltrados.length > 0
                  ) {
                    evento.preventDefault();
                    setIndiceProductoActivo((indice) =>
                      Math.max(indice - 1, 0),
                    );
                  } else if (evento.key === "Enter") {
                    const texto = busquedaProducto.trim();
                    const esCodigo =
                      productos.some(
                        (producto) => producto.codigoBarras === texto,
                      ) || /^\d{6,}$/.test(texto);
                    if (texto && esCodigo) {
                      // Código escrito o enviado por una pistola lectora.
                      evento.preventDefault();
                      agregarPorCodigo(texto);
                      return;
                    }
                    const producto = listaProductosAbierta
                      ? productosFiltrados[indiceProductoActivo]
                      : undefined;
                    if (producto) {
                      evento.preventDefault();
                      seleccionarProducto(producto);
                    }
                  }
                }}
                placeholder="Buscar por nombre, SKU o código de barras"
                role="combobox"
                type="search"
                value={busquedaProducto}
              />
              <BotonLectorCodigo
                etiqueta="Escanear código de barras"
                onLeido={agregarPorCodigo}
              />
            </div>
            {listaProductosAbierta ? (
              <div
                aria-label="Productos disponibles"
                className="modulo-operativo__lista-productos"
                id="producto-venta-opciones"
                role="listbox"
              >
                {productosFiltrados.length > 0 ? (
                  productosFiltrados.map((producto, indice) => (
                    <button
                      aria-selected={
                        `${producto.productoId}|${producto.combinacionId ?? ""}` ===
                        productoSeleccionado
                      }
                      className={
                        indice === indiceProductoActivo
                          ? "modulo-operativo__opcion-producto modulo-operativo__opcion-producto--activa"
                          : "modulo-operativo__opcion-producto"
                      }
                      id={`producto-venta-opcion-${indice}`}
                      key={`${producto.productoId}|${producto.combinacionId ?? ""}`}
                      onClick={() => seleccionarProducto(producto)}
                      onMouseEnter={() => setIndiceProductoActivo(indice)}
                      onMouseDown={(evento) => evento.preventDefault()}
                      role="option"
                      tabIndex={-1}
                      type="button"
                    >
                      <strong>{producto.descripcion}</strong>
                      <small>{producto.sku}</small>
                    </button>
                  ))
                ) : (
                  <p className="modulo-operativo__productos-sin-resultados">
                    No hay productos que coincidan con la búsqueda.
                  </p>
                )}
              </div>
            ) : null}
          </div>
          <label className="campo">
            <span>Cantidad</span>
            <input
              min="0.001"
              onChange={(evento) => setCantidadProducto(evento.target.value)}
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
                      <td data-etiqueta="Producto" data-principal>
                        {linea.producto.descripcion}
                      </td>
                      <td data-etiqueta="Cantidad">
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
                      <td data-etiqueta="Precio de referencia">
                        {formatearImporte(linea.producto.precio, "PEN")}
                      </td>
                      <td data-etiqueta="Acción" data-acciones>
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
              Agrega al menos un producto. El total y los impuestos los calcula
              el servidor al guardar.
            </p>
          )}
          <p className="modulo-operativo__ancho-completo modulo-operativo__nota">
            Al confirmar, el sistema enviará esta venta como{" "}
            {nombreComprobante(tipoComprobante)}. El servidor vuelve a validar
            precios, impuestos y existencias.
          </p>
          {error ? (
            <p
              className="modulo-operativo__aviso modulo-operativo__aviso--error modulo-operativo__ancho-completo"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <div className="modulo-operativo__acciones modulo-operativo__acciones--dialogo modulo-operativo__acciones--venta modulo-operativo__ancho-completo">
            <div className="modulo-operativo__grupo-acciones-venta">
              <button
                className="modulo-operativo__boton-secundario"
                disabled={Boolean(operacionId)}
                onClick={() => setAbierto(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="modulo-operativo__boton-secundario"
                disabled={Boolean(operacionId)}
                name="accion"
                type="submit"
                value="borrador"
              >
                {operacionId && accionGuardado === "borrador"
                  ? "Guardando…"
                  : ventaEditada
                    ? "Guardar cambios"
                    : "Guardar borrador"}
              </button>
            </div>
            <button
              className="boton-principal"
              disabled={Boolean(operacionId)}
              name="accion"
              type="submit"
              value="confirmar"
            >
              {operacionId && accionGuardado === "confirmar"
                ? "Guardando para confirmar…"
                : "Confirmar venta"}
            </button>
          </div>
        </form>
      </DialogoModal>

      <DialogoModal
        abierto={Boolean(ventaAConfirmar)}
        bloqueado={Boolean(operacionId)}
        onCerrar={() => {
          if (!operacionId) setVentaAConfirmar(null);
        }}
        titulo={
          ventaAConfirmar?.estado === "confirmada"
            ? "Completar envío del comprobante"
            : "Confirmar venta y emitir comprobante"
        }
      >
        {ventaAConfirmar ? (
          <>
            <p>
              {ventaAConfirmar.clienteNombre ?? "Venta de mostrador"} ·{" "}
              {formatearImporte(ventaAConfirmar.total, ventaAConfirmar.moneda)}
            </p>
            <p>
              {ventaAConfirmar.estado === "confirmada"
                ? "La venta ya está confirmada; el inventario no volverá a cambiar. El sistema enviará inmediatamente el comprobante a NubeFacT."
                : "Al confirmar se actualizarán las existencias y el sistema enviará inmediatamente el comprobante a NubeFacT."}
            </p>
            {ventaAConfirmar.tipoComprobante ? (
              <p className="modulo-operativo__nota">
                Se enviará como{" "}
                {nombreComprobante(
                  ventaAConfirmar.tipoComprobante === "boleta" &&
                    ventaAConfirmar.clienteId === null
                    ? "boleta_simple"
                    : ventaAConfirmar.tipoComprobante,
                )}
                .
              </p>
            ) : (
              <fieldset className="modulo-operativo__opciones-comprobante">
                <legend>Tipo de comprobante</legend>
                <label>
                  <input
                    checked={tipoComprobante === "boleta"}
                    disabled={!boletaDisponibleConfirmacion}
                    name="tipo-comprobante-confirmar"
                    onChange={() => setTipoComprobante("boleta")}
                    type="radio"
                  />
                  Boleta
                </label>
                {ventaAConfirmar.clienteId === null ? (
                  <label>
                    <input
                      checked={tipoComprobante === "boleta_simple"}
                      name="tipo-comprobante-confirmar"
                      onChange={() => setTipoComprobante("boleta_simple")}
                      type="radio"
                    />
                    Boleta simple
                  </label>
                ) : null}
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
                La factura requiere un RUC válido de 11 dígitos que empiece por
                10 o 20.
              </p>
            ) : null}
            {tipoComprobante === "boleta" && !boletaDisponibleConfirmacion ? (
              <p className="modulo-operativo__nota">
                La boleta requiere un cliente con DNI válido. Si no tienes sus
                datos y el total es menor de S/ 700, usa Boleta simple.
              </p>
            ) : null}
            {(tipoComprobante === "boleta" ||
              tipoComprobante === "boleta_simple") &&
            ventaAConfirmar.total >= 700 &&
            (tipoComprobante === "boleta_simple" ||
              !ventaAConfirmar.clienteNumeroDocumento) ? (
              <p className="modulo-operativo__nota">
                Esta boleta es de S/ 700 o más y requiere identificar al
                cliente.
              </p>
            ) : null}
            <div className="modulo-operativo__acciones modulo-operativo__acciones--dialogo">
              {operacionId === ventaAConfirmar.id ? (
                <p
                  aria-live="polite"
                  className="modulo-operativo__nota"
                  role="status"
                >
                  {faseConfirmacion === "enviando"
                    ? "Enviando comprobante a NubeFacT…"
                    : "Confirmando la venta y actualizando existencias…"}
                </p>
              ) : null}
              <button
                className="modulo-operativo__boton-secundario"
                disabled={Boolean(operacionId)}
                onClick={() => setVentaAConfirmar(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="boton-principal"
                disabled={
                  Boolean(operacionId) ||
                  (tipoComprobante === "boleta" &&
                    !boletaDisponibleConfirmacion) ||
                  (tipoComprobante === "factura" &&
                    !facturaDisponibleConfirmacion) ||
                  (tipoComprobante === "boleta" &&
                    ventaAConfirmar.clienteId === null) ||
                  (tipoComprobante === "boleta_simple" &&
                    ventaAConfirmar.total >= 700)
                }
                onClick={() => void confirmarYEmitir()}
                type="button"
              >
                {operacionId === ventaAConfirmar.id
                  ? faseConfirmacion === "enviando"
                    ? "Enviando comprobante…"
                    : "Confirmando venta…"
                  : "Confirmar y enviar"}
              </button>
            </div>
          </>
        ) : null}
      </DialogoModal>
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
    codigoBarras: null,
    descripcion: linea.descripcion,
    precio: linea.precioUnitario,
    unidadMedida: linea.unidadMedida,
  };
}

function traducirError(mensaje: string): string {
  if (mensaje.includes("existencias suficientes"))
    return "No hay stock suficiente para completar la venta. Reduce la cantidad o ajusta las existencias antes de guardar o confirmar.";
  if (mensaje.includes("precio de un producto cambió"))
    return "El precio cambió desde que guardaste el borrador. Actualízalo antes de confirmar.";
  if (mensaje.includes("impuestos cambió"))
    return "La configuración de impuestos cambió. Actualiza el borrador antes de confirmar.";
  if (
    mensaje.includes("RUC") ||
    mensaje.includes("DNI") ||
    mensaje.includes("boleta") ||
    mensaje.includes("serie activa") ||
    mensaje.includes("factura requiere") ||
    mensaje.includes("boletas")
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
