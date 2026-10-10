"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import { emitirComprobante } from "@/funcionalidades/facturacion/emision";
import type { TipoComprobante } from "@/funcionalidades/facturacion/consultas";
import { adjuntarBorradores, type BorradorVentaAsistente } from "./ventas-chat";
import type { ConversacionAsistente, MensajeAsistente } from "./consultas";

export function PaginaAsistente({
  conversacionesIniciales,
  mensajesIniciales,
  conversacionInicial,
  errorInicial,
}: {
  conversacionesIniciales: ConversacionAsistente[];
  mensajesIniciales: MensajeAsistente[];
  conversacionInicial: string | null;
  errorInicial: string | null;
}) {
  const [conversaciones, setConversaciones] = useState(conversacionesIniciales);
  const [mensajes, setMensajes] = useState(mensajesIniciales);
  const [conversacionId, setConversacionId] = useState(conversacionInicial);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ventaConfirmando, setVentaConfirmando] = useState<string | null>(null);
  const [estadoVenta, setEstadoVenta] = useState<string | null>(null);
  const [error, setError] = useState(errorInicial);
  const mensajesRef = useRef<HTMLDivElement>(null);
  const campoMensajeRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const contenedor = mensajesRef.current;
    if (!contenedor) return;
    contenedor.scrollTo({
      top: contenedor.scrollHeight,
      behavior: "smooth",
    });
  }, [mensajes]);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const mensaje = texto.trim();
    if (!mensaje || enviando) return;
    setError(null);
    setEstadoVenta(null);
    setEnviando(true);
    setMensajes((actuales) => [
      ...actuales,
      {
        id: `temporal-${Date.now()}`,
        rol: "usuario",
        contenido: mensaje,
        creadoEn: new Date().toISOString(),
        ventaId: null,
      },
    ]);
    setTexto("");
    try {
      const supabase = crearClienteSupabase();
      const { data, error: errorFuncion } = await supabase.functions.invoke(
        "asistente",
        {
          body: { mensaje, ...(conversacionId ? { conversacionId } : {}) },
        },
      );
      if (errorFuncion || !data?.mensaje || !data?.conversacionId) {
        throw new Error(await detalleError(errorFuncion));
      }
      const mensajesAsistente = await adjuntarBorradores(supabase, [
        {
          id: `respuesta-${Date.now()}`,
          rol: "asistente",
          contenido: data.mensaje,
          creadoEn: new Date().toISOString(),
          ventaId:
            typeof data.borradorVentaId === "string"
              ? data.borradorVentaId
              : null,
        },
      ]);
      setConversacionId(data.conversacionId);
      setMensajes((actuales) => [...actuales, ...mensajesAsistente]);
      setConversaciones((actuales) => {
        const existente = actuales.find(
          (item) => item.id === data.conversacionId,
        );
        if (existente)
          return actuales.map((item) =>
            item.id === existente.id
              ? { ...item, actualizadaEn: new Date().toISOString() }
              : item,
          );
        return [
          {
            id: data.conversacionId,
            titulo: mensaje.slice(0, 80),
            actualizadaEn: new Date().toISOString(),
          },
          ...actuales,
        ];
      });
    } catch (errorEnvio) {
      setMensajes((actuales) =>
        actuales.filter((item) => !item.id.startsWith("temporal-")),
      );
      setError(
        errorEnvio instanceof Error
          ? errorEnvio.message
          : "No se pudo completar la consulta. Inténtalo de nuevo.",
      );
      setTexto(mensaje);
    } finally {
      setEnviando(false);
    }
  }

  async function abrirConversacion(id: string) {
    setError(null);
    const supabase = crearClienteSupabase();
    const { data, error: errorConsulta } = await supabase
      .from("mensajes")
      .select("id, rol, contenido, creado_en, venta_id")
      .eq("conversacion_id", id)
      .order("creado_en", { ascending: true });
    if (errorConsulta) {
      setError("No se pudo abrir esa conversación.");
      return;
    }
    setConversacionId(id);
    const mensajesDeConversacion = (data ?? []).map((item) => ({
      id: item.id,
      rol: item.rol as "usuario" | "asistente",
      contenido: item.contenido,
      creadoEn: item.creado_en,
      ventaId: item.venta_id,
    }));
    setMensajes(await adjuntarBorradores(supabase, mensajesDeConversacion));
  }

  async function confirmarBorrador(
    mensajeId: string,
    venta: BorradorVentaAsistente,
    tipoComprobante: TipoComprobante,
  ) {
    setError(null);
    setEstadoVenta(null);
    setVentaConfirmando(venta.id);
    const supabase = crearClienteSupabase();
    let errorConfirmar: { message: string } | null;
    try {
      const resultado = await supabase.rpc("confirmar_venta_con_comprobante", {
        venta_objetivo: venta.id,
        tipo_comprobante_solicitado: tipoComprobante,
      });
      errorConfirmar = resultado.error;
    } catch {
      setVentaConfirmando(null);
      setError(
        "No se recibió respuesta al confirmar. Puedes volver a intentarlo; el sistema evita descontar el inventario dos veces.",
      );
      return;
    }
    if (errorConfirmar) {
      setVentaConfirmando(null);
      setError(traducirErrorVenta(errorConfirmar.message));
      return;
    }
    setMensajes((actuales) =>
      actuales.map((mensaje) =>
        mensaje.id === mensajeId && mensaje.borradorVenta
          ? {
              ...mensaje,
              borradorVenta: {
                ...mensaje.borradorVenta,
                estado: "confirmada",
                tipoComprobante,
              },
            }
          : mensaje,
      ),
    );
    try {
      const respuesta = await emitirComprobante(
        supabase,
        venta.id,
        tipoComprobante,
      );
      setEstadoVenta(
        respuesta.estado === "emitido"
          ? tipoComprobante === "boleta"
            ? "Venta confirmada y boleta enviada a NubeFacT. La aceptación de SUNAT se consultará después."
            : respuesta.aceptadaPorSunat
              ? "Venta confirmada y factura aceptada por SUNAT."
              : "Venta confirmada y factura enviada a NubeFacT. La respuesta de SUNAT sigue pendiente."
          : "Venta confirmada. El comprobante sigue en proceso; revisa Facturación para ver el estado.",
      );
    } catch (errorEmision) {
      setError(
        `La venta quedó confirmada, pero no se pudo completar el envío: ${errorEmision instanceof Error ? errorEmision.message : "error de conexión"} Revisa Facturación para reintentar.`,
      );
    } finally {
      setVentaConfirmando(null);
    }
  }

  function nuevaConversacion() {
    setConversacionId(null);
    setMensajes([]);
    setTexto("");
    setError(null);
    campoMensajeRef.current?.focus();
  }

  return (
    <section className="modulo-operativo asistente-modulo">
      <header className="encabezado-seccion">
        <div>
          <p className="rotulo">AYUDA PARA EL DÍA A DÍA</p>
          <h1>Asistente IA</h1>
          <p className="encabezado-seccion__texto">
            Consulta información de los módulos, pide ayuda para el trabajo
            diario o prepara un borrador de venta.
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
      {estadoVenta ? (
        <p
          aria-live="polite"
          className="modulo-operativo__aviso modulo-operativo__aviso--bien"
          role="status"
        >
          {estadoVenta}
        </p>
      ) : null}
      <div className="asistente-modulo__rejilla">
        <aside
          aria-label="Conversaciones anteriores"
          className="modulo-operativo__panel asistente-modulo__historial"
        >
          <div className="tarjeta-panel__encabezado">
            <h2>Conversaciones</h2>
            <button
              className="modulo-operativo__boton-texto"
              onClick={nuevaConversacion}
              type="button"
            >
              Nueva
            </button>
          </div>
          {conversaciones.length ? (
            <nav className="asistente-modulo__lista">
              {conversaciones.map((conversacion) => (
                <button
                  aria-current={
                    conversacion.id === conversacionId ? "page" : undefined
                  }
                  key={conversacion.id}
                  onClick={() => abrirConversacion(conversacion.id)}
                  type="button"
                >
                  {conversacion.titulo}
                </button>
              ))}
            </nav>
          ) : (
            <p className="modulo-operativo__nota">
              Tus consultas aparecerán aquí.
            </p>
          )}
        </aside>
        <section
          aria-label="Chat con el asistente"
          className="modulo-operativo__panel asistente-modulo__chat"
        >
          <div
            aria-live="polite"
            className="asistente-modulo__mensajes"
            ref={mensajesRef}
          >
            {mensajes.length ? (
              mensajes.map((mensaje) => (
                <article
                  className={`asistente-modulo__mensaje asistente-modulo__mensaje--${mensaje.rol}`}
                  key={mensaje.id}
                >
                  <span>{mensaje.rol === "usuario" ? "Tú" : "Asistente"}</span>
                  <p>{renderizarContenido(mensaje.contenido)}</p>
                  {mensaje.borradorVenta ? (
                    <TarjetaBorradorVenta
                      confirmando={
                        ventaConfirmando === mensaje.borradorVenta.id
                      }
                      onConfirmar={(tipo) =>
                        void confirmarBorrador(
                          mensaje.id,
                          mensaje.borradorVenta!,
                          tipo,
                        )
                      }
                      venta={mensaje.borradorVenta}
                    />
                  ) : null}
                </article>
              ))
            ) : (
              <div className="modulo-operativo__vacio">
                <strong>¿Qué necesitas resolver?</strong>
                <span>
                  Pregunta por productos, existencias, clientes, ventas,
                  facturación, reportes o el uso del panel.
                </span>
                <div className="asistente-modulo__ejemplos">
                  <button
                    onClick={() => setTexto("¿Cuántos productos tenemos?")}
                    type="button"
                  >
                    ¿Cuántos productos tenemos?
                  </button>
                  <button
                    onClick={() => setTexto("¿Qué productos debo reponer?")}
                    type="button"
                  >
                    ¿Qué productos debo reponer?
                  </button>
                  <button
                    onClick={() => setTexto("Resume las ventas de hoy")}
                    type="button"
                  >
                    Resume las ventas de hoy
                  </button>
                  <button
                    onClick={() => setTexto("Quiero armar una venta")}
                    type="button"
                  >
                    Quiero armar una venta
                  </button>
                </div>
              </div>
            )}
          </div>
          <form className="asistente-modulo__formulario" onSubmit={enviar}>
            <label className="campo">
              <span className="sr-only">Mensaje para el asistente</span>
              <textarea
                aria-label="Mensaje para el asistente"
                maxLength={4000}
                onChange={(evento) => setTexto(evento.target.value)}
                onKeyDown={(evento) => {
                  if (
                    evento.key !== "Enter" ||
                    evento.shiftKey ||
                    evento.nativeEvent.isComposing
                  ) {
                    return;
                  }
                  evento.preventDefault();
                  evento.currentTarget.form?.requestSubmit();
                }}
                placeholder="Escribe tu consulta…"
                ref={campoMensajeRef}
                required
                rows={3}
                value={texto}
              />
            </label>
            <div className="asistente-modulo__pie">
              <span>
                La IA prepara información y borradores; tú decides cuándo
                confirmar una venta.
              </span>
              <button
                className="boton-principal"
                disabled={enviando}
                type="submit"
              >
                {enviando ? "Consultando…" : "Enviar mensaje"}
              </button>
            </div>
          </form>
        </section>
      </div>
      <p className="modulo-operativo__nota">
        Revisa los importes y los datos antes de confirmar una operación.{" "}
        <Link href="/panel/ventas">Ir a ventas</Link>
      </p>
    </section>
  );
}

function renderizarContenido(contenido: string) {
  return contenido.split(/\r?\n/).flatMap((linea, indiceLinea) => {
    const segmentos = linea.split(/(\*\*.*?\*\*)/g);
    const contenidoLinea = segmentos.map((segmento, indiceSegmento) => {
      if (segmento.startsWith("**") && segmento.endsWith("**")) {
        return (
          <strong key={`${indiceLinea}-${indiceSegmento}`}>
            {segmento.slice(2, -2)}
          </strong>
        );
      }
      return segmento.replaceAll("**", "");
    });
    return indiceLinea === 0
      ? contenidoLinea
      : [<br key={`salto-${indiceLinea}`} />, ...contenidoLinea];
  });
}

function TarjetaBorradorVenta({
  venta,
  confirmando,
  onConfirmar,
}: {
  venta: BorradorVentaAsistente;
  confirmando: boolean;
  onConfirmar: (tipo: TipoComprobante) => void;
}) {
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>(
    venta.tipoComprobante ?? "boleta",
  );
  const boletaIdentificada =
    venta.total <= 700 || Boolean(venta.clienteNumeroDocumento);
  const facturaDisponible =
    venta.clienteTipoDocumento === "ruc" &&
    Boolean(venta.clienteNumeroDocumento);
  return (
    <section
      aria-label="Borrador de venta"
      className="asistente-modulo__borrador-venta"
    >
      <div className="asistente-modulo__borrador-encabezado">
        <strong>Venta para {venta.clienteNombre}</strong>
        <span
          className={`modulo-operativo__estado modulo-operativo__estado--${venta.estado}`}
        >
          {venta.estado === "borrador"
            ? "Borrador"
            : venta.estado === "confirmada"
              ? "Confirmada"
              : "Descartada"}
        </span>
      </div>
      <ul className="asistente-modulo__borrador-lineas">
        {venta.lineas.map((linea, indice) => (
          <li key={`${linea.descripcion}-${indice}`}>
            <span>{linea.descripcion}</span>
            <span>{linea.cantidad} un.</span>
            <strong>{formatearImporte(linea.total, venta.moneda)}</strong>
          </li>
        ))}
      </ul>
      <p className="asistente-modulo__borrador-total">
        <span>Total</span>
        <strong>{formatearImporte(venta.total, venta.moneda)}</strong>
      </p>
      {venta.estado === "borrador" ? (
        <div className="asistente-modulo__borrador-confirmacion">
          {venta.tipoComprobante ? (
            <p className="modulo-operativo__nota">
              Comprobante elegido: <strong>{venta.tipoComprobante}</strong>. Se
              enviará automáticamente al confirmar.
            </p>
          ) : (
            <fieldset className="modulo-operativo__opciones-comprobante">
              <legend>Elige el comprobante</legend>
              <label>
                <input
                  checked={tipoComprobante === "boleta"}
                  name={`comprobante-${venta.id}`}
                  onChange={() => setTipoComprobante("boleta")}
                  type="radio"
                />
                Boleta
              </label>
              <label>
                <input
                  checked={tipoComprobante === "factura"}
                  disabled={!facturaDisponible}
                  name={`comprobante-${venta.id}`}
                  onChange={() => setTipoComprobante("factura")}
                  type="radio"
                />
                Factura
              </label>
            </fieldset>
          )}
          {!facturaDisponible ? (
            <p className="modulo-operativo__nota">
              La factura requiere un cliente con RUC válido registrado.
            </p>
          ) : null}
          {!boletaIdentificada && tipoComprobante === "boleta" ? (
            <p className="modulo-operativo__nota">
              La boleta supera S/ 700 y requiere identificar al cliente.
            </p>
          ) : null}
          <button
            className="boton-principal"
            disabled={
              confirmando ||
              (tipoComprobante === "boleta" && !boletaIdentificada)
            }
            onClick={() => onConfirmar(tipoComprobante)}
            type="button"
          >
            {confirmando ? "Confirmando y enviando…" : "Confirmar y enviar"}
          </button>
        </div>
      ) : (
        <Link className="modulo-operativo__boton-texto" href="/panel/ventas">
          Ver venta
        </Link>
      )}
    </section>
  );
}

function formatearImporte(total: number, moneda: "PEN" | "USD") {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: moneda,
  }).format(total);
}

function traducirErrorVenta(mensaje: string) {
  if (mensaje.includes("existencias"))
    return "No hay existencias suficientes. Revisa la venta antes de confirmarla.";
  if (mensaje.includes("precio"))
    return "El precio del producto cambió. Revisa el borrador en Ventas antes de confirmar.";
  if (mensaje.includes("cliente"))
    return "El cliente ya no está disponible. Actualiza la venta en Ventas.";
  if (
    mensaje.includes("RUC") ||
    mensaje.includes("serie activa") ||
    mensaje.includes("factura requiere") ||
    mensaje.includes("boletas mayores")
  )
    return mensaje;
  return "No se pudo confirmar la venta. Revisa el borrador e inténtalo de nuevo.";
}

async function detalleError(
  error: { message: string; context?: unknown } | null,
) {
  if (!error) return "No se recibió una respuesta válida del asistente.";
  const contexto = error.context;
  if (contexto instanceof Response) {
    try {
      const cuerpo = (await contexto.clone().json()) as { detalle?: string };
      if (cuerpo.detalle) return cuerpo.detalle;
    } catch {
      /* Conserva un mensaje seguro cuando la respuesta no sea JSON. */
    }
  }
  return (
    error.message || "No se pudo completar la consulta. Inténtalo de nuevo."
  );
}
