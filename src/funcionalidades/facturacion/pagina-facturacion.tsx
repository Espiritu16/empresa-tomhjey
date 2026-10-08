"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import type {
  ComprobanteFacturacion,
  PaginaFacturacion as DatosFacturacion,
  TipoComprobante,
  VentaFacturable,
} from "./consultas";

type Propiedades = { datos: DatosFacturacion };

export function PaginaFacturacion({ datos }: Propiedades) {
  const router = useRouter();
  const [serieFormularios, setSerieFormularios] = useState(() => ({
    factura: {
      serie:
        datos.series.find((serie) => serie.tipo === "factura")?.serie ?? "",
      siguienteNumero:
        datos.series
          .find((serie) => serie.tipo === "factura")
          ?.siguienteNumero.toString() ?? "",
    },
    boleta: {
      serie: datos.series.find((serie) => serie.tipo === "boleta")?.serie ?? "",
      siguienteNumero:
        datos.series
          .find((serie) => serie.tipo === "boleta")
          ?.siguienteNumero.toString() ?? "",
    },
  }));
  const [guardandoSerie, setGuardandoSerie] = useState<TipoComprobante | null>(
    null,
  );
  const [operacionId, setOperacionId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(datos.error);

  async function guardarSerie(
    evento: FormEvent<HTMLFormElement>,
    tipo: TipoComprobante,
  ) {
    evento.preventDefault();
    setError(null);
    setMensaje(null);

    const formulario = serieFormularios[tipo];
    const numero = Number(formulario.siguienteNumero);
    const prefijo = tipo === "factura" ? "F" : "B";
    if (
      !new RegExp(`^${prefijo}[A-Z0-9]{3}$`).test(
        formulario.serie.trim().toUpperCase(),
      )
    ) {
      setError(
        `La serie de ${tipo} debe tener cuatro caracteres y empezar con ${prefijo}.`,
      );
      return;
    }
    if (!Number.isSafeInteger(numero) || numero <= 0) {
      setError(
        "Escribe el siguiente correlativo como un número entero positivo.",
      );
      return;
    }

    setGuardandoSerie(tipo);
    try {
      const supabase = crearClienteSupabase();
      const { data: respuesta, error: errorFuncion } =
        await supabase.functions.invoke("facturacion", {
          body: {
            operacion: "configurar_serie",
            tipo,
            serie: formulario.serie.trim().toUpperCase(),
            siguienteNumero: numero,
          },
        });

      if (errorFuncion) {
        setError(await leerErrorFuncion(errorFuncion));
        return;
      }

      setMensaje(
        `La serie ${respuesta.serie} quedó lista desde el número ${respuesta.siguienteNumero}.`,
      );
      setSerieFormularios((actual) => ({
        ...actual,
        [tipo]: {
          serie: respuesta.serie,
          siguienteNumero: String(respuesta.siguienteNumero),
        },
      }));
      router.refresh();
    } catch {
      setError(`No se pudo guardar la serie de ${tipo}. Inténtalo de nuevo.`);
    } finally {
      setGuardandoSerie(null);
    }
  }

  async function emitir(venta: VentaFacturable, tipo: TipoComprobante) {
    await ejecutarEmision(venta.id, venta.clienteNombre, tipo, "Emitir");
  }

  async function reintentar(comprobante: ComprobanteFacturacion) {
    await ejecutarEmision(
      comprobante.ventaId,
      comprobante.clienteNombre,
      comprobante.tipo,
      "Reintentar",
    );
  }

  async function consultarBoleta(comprobante: ComprobanteFacturacion) {
    setError(null);
    setMensaje(null);
    setOperacionId(comprobante.id);
    try {
      const supabase = crearClienteSupabase();
      const { data: respuesta, error: errorFuncion } =
        await supabase.functions.invoke("facturacion", {
          body: {
            operacion: "consultar_boleta",
            comprobanteId: comprobante.id,
          },
        });
      if (errorFuncion) {
        setError(await leerErrorFuncion(errorFuncion));
        router.refresh();
        return;
      }
      setMensaje(
        !respuesta.encontrada
          ? "NubeFacT aún no encuentra la boleta para consultar su estado. Sigue pendiente; podrás volver a consultar mañana."
          : respuesta.aceptadaPorSunat
            ? `La boleta de ${comprobante.clienteNombre} fue aceptada por SUNAT.`
            : `SUNAT todavía no acepta la boleta de ${comprobante.clienteNombre}. Podrás volver a consultar mañana.`,
      );
      router.refresh();
    } catch {
      setError(
        "No se pudo consultar la aceptación de la boleta. Inténtalo de nuevo.",
      );
    } finally {
      setOperacionId(null);
    }
  }

  async function ejecutarEmision(
    ventaId: string,
    clienteNombre: string,
    tipo: TipoComprobante,
    accion: string,
  ) {
    setError(null);
    setMensaje(null);
    setOperacionId(ventaId);

    try {
      const supabase = crearClienteSupabase();
      const { data: respuesta, error: errorFuncion } =
        await supabase.functions.invoke("facturacion", {
          body: { ventaId, tipo },
        });

      if (errorFuncion) {
        setError(await leerErrorFuncion(errorFuncion));
        router.refresh();
        return;
      }

      setMensaje(
        respuesta.estado === "emitiendo"
          ? `La ${tipo} de ${clienteNombre} sigue en proceso. Puedes verificar su resultado sin cambiar el correlativo.`
          : tipo === "boleta"
            ? `La boleta de ${clienteNombre} se envió a NubeFacT. La aceptación de SUNAT se podrá consultar después de siete días.`
            : respuesta.aceptadaPorSunat === true
              ? `La factura de ${clienteNombre} fue aceptada por SUNAT.`
              : `La factura de ${clienteNombre} se envió a NubeFacT. La respuesta aún no confirma aceptación de SUNAT.`,
      );
      router.refresh();
    } catch {
      setError(
        `No se pudo ${accion.toLowerCase()} la ${tipo}. Puedes volver a intentarlo.`,
      );
      router.refresh();
    } finally {
      setOperacionId(null);
    }
  }

  const serieDe = (tipo: TipoComprobante) =>
    datos.series.find((serie) => serie.tipo === tipo);
  const puedeEmitir = (venta: VentaFacturable, tipo: TipoComprobante) => {
    if (!datos.empresa?.ruc || !serieDe(tipo)) return false;
    const tieneDocumento = Boolean(venta.clienteNumeroDocumento?.trim());
    if (tipo === "factura") {
      return venta.clienteTipoDocumento === "ruc" && tieneDocumento;
    }
    return venta.total <= 700 || tieneDocumento;
  };
  const aceptadas = datos.comprobantes.filter(fueAceptada).length;
  const pendientes = datos.comprobantes.filter(
    (comprobante) =>
      comprobante.estado === "emitiendo" ||
      (comprobante.estado === "emitido" && !fueAceptada(comprobante)),
  ).length;

  return (
    <div className="facturacion">
      <header className="encabezado-seccion">
        <div>
          <p className="rotulo">DOCUMENTOS FISCALES</p>
          <h1>Facturación</h1>
          <p className="encabezado-seccion__texto">
            Emite facturas y boletas de tus ventas confirmadas y consulta la
            respuesta de NubeFacT.
          </p>
        </div>
      </header>

      {error ? (
        <p
          aria-live="assertive"
          className="facturacion__aviso facturacion__aviso--error"
        >
          {error}
        </p>
      ) : null}
      {mensaje ? (
        <p
          aria-live="polite"
          className="facturacion__aviso facturacion__aviso--bien"
        >
          {mensaje}
        </p>
      ) : null}

      {!datos.empresa?.ruc ? (
        <section className="facturacion__bloqueo" role="status">
          <strong>Falta el RUC de la empresa</strong>
          <p>
            Completa los datos fiscales de la empresa antes de emitir un
            comprobante.
          </p>
        </section>
      ) : null}

      <section
        aria-label="Resumen de facturación"
        className="facturacion__resumen"
      >
        <article className="facturacion__indicador">
          <span>COMPROBANTES REGISTRADOS</span>
          <strong>{datos.comprobantes.length}</strong>
        </article>
        <article className="facturacion__indicador">
          <span>ACEPTADAS POR SUNAT</span>
          <strong>{aceptadas}</strong>
        </article>
        <article className="facturacion__indicador">
          <span>PENDIENTES DE CONFIRMACIÓN</span>
          <strong>{pendientes}</strong>
        </article>
      </section>

      {(["factura", "boleta"] as const).map((tipo) => {
        const prefijo = tipo === "factura" ? "F" : "B";
        const serieActiva = serieDe(tipo);
        const formulario = serieFormularios[tipo];
        return (
          <section
            aria-labelledby={`serie-${tipo}-titulo`}
            className="facturacion__tarjeta"
            key={tipo}
          >
            <div className="facturacion__titulo-bloque">
              <div>
                <p className="rotulo">CONFIGURACIÓN FISCAL</p>
                <h2 id={`serie-${tipo}-titulo`}>
                  Serie de {tipo === "factura" ? "factura" : "boleta"}
                </h2>
              </div>
              {serieActiva ? (
                <span className="facturacion__serie-activa">
                  {serieActiva.serie}
                </span>
              ) : null}
            </div>
            <p className="facturacion__descripcion">
              Usa la serie y el siguiente correlativo habilitados en tu cuenta
              de NubeFacT. El sistema no permite retroceder el número.
            </p>
            <form
              className="facturacion__formulario-serie"
              onSubmit={(evento) => void guardarSerie(evento, tipo)}
            >
              <label>
                <span>Serie</span>
                <input
                  autoComplete="off"
                  maxLength={4}
                  onChange={(evento) =>
                    setSerieFormularios((actual) => ({
                      ...actual,
                      [tipo]: {
                        ...actual[tipo],
                        serie: evento.target.value.toUpperCase(),
                      },
                    }))
                  }
                  pattern={`${prefijo}[A-Z0-9]{3}`}
                  placeholder={`${prefijo}001`}
                  required
                  value={formulario.serie}
                />
              </label>
              <label>
                <span>Siguiente correlativo</span>
                <input
                  inputMode="numeric"
                  min="1"
                  onChange={(evento) =>
                    setSerieFormularios((actual) => ({
                      ...actual,
                      [tipo]: {
                        ...actual[tipo],
                        siguienteNumero: evento.target.value,
                      },
                    }))
                  }
                  placeholder="1"
                  required
                  step="1"
                  type="number"
                  value={formulario.siguienteNumero}
                />
              </label>
              <button
                className="boton-principal"
                disabled={guardandoSerie !== null}
                type="submit"
              >
                {guardandoSerie === tipo ? "Guardando…" : "Guardar serie"}
              </button>
            </form>
          </section>
        );
      })}

      <section
        aria-labelledby="ventas-facturables-titulo"
        className="facturacion__tarjeta"
      >
        <div className="facturacion__titulo-bloque">
          <div>
            <p className="rotulo">VENTAS CONFIRMADAS</p>
            <h2 id="ventas-facturables-titulo">Listas para emitir</h2>
          </div>
          <span className="facturacion__contador">
            {datos.ventasElegibles.length}
          </span>
        </div>
        {!datos.empresa?.ruc ? (
          <p className="facturacion__nota">
            Completa el RUC de la empresa para habilitar la emisión.
          </p>
        ) : null}
        {datos.ventasElegibles.length === 0 ? (
          <div className="facturacion__vacio">
            <strong>No hay ventas listas para emitir</strong>
            <span>
              Aquí aparecerán las ventas confirmadas que todavía no tengan
              comprobante.
            </span>
          </div>
        ) : (
          <div className="facturacion__tabla-contenedor">
            <table className="facturacion__tabla">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Documento</th>
                  <th scope="col">Total</th>
                  <th scope="col">
                    <span className="visualmente-oculto">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {datos.ventasElegibles.map((venta) => (
                  <tr key={venta.id}>
                    <td>{formatearFecha(venta.confirmadoEn)}</td>
                    <td>{venta.clienteNombre}</td>
                    <td className="facturacion__mono">
                      {etiquetaDocumento(
                        venta.clienteTipoDocumento,
                        venta.clienteNumeroDocumento,
                      )}
                    </td>
                    <td className="facturacion__mono">
                      {formatearImporte(venta.total, venta.moneda)}
                    </td>
                    <td className="facturacion__accion">
                      <button
                        className="facturacion__boton-secundario"
                        disabled={
                          !puedeEmitir(venta, "factura") || operacionId !== null
                        }
                        onClick={() => void emitir(venta, "factura")}
                        title={
                          !puedeEmitir(venta, "factura")
                            ? "Para emitir factura, el cliente debe tener RUC."
                            : undefined
                        }
                        type="button"
                      >
                        {operacionId === venta.id
                          ? "Enviando…"
                          : "Emitir factura"}
                      </button>
                      <button
                        className="facturacion__boton-secundario"
                        disabled={
                          !puedeEmitir(venta, "boleta") || operacionId !== null
                        }
                        onClick={() => void emitir(venta, "boleta")}
                        title={
                          !puedeEmitir(venta, "boleta")
                            ? "La boleta requiere identificar al cliente cuando supera S/ 700."
                            : undefined
                        }
                        type="button"
                      >
                        {operacionId === venta.id
                          ? "Enviando…"
                          : "Emitir boleta"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        aria-labelledby="historial-facturas-titulo"
        className="facturacion__tarjeta"
      >
        <div className="facturacion__titulo-bloque">
          <div>
            <p className="rotulo">SEGUIMIENTO</p>
            <h2 id="historial-facturas-titulo">Comprobantes emitidos</h2>
          </div>
        </div>
        {datos.comprobantes.length === 0 ? (
          <div className="facturacion__vacio">
            <strong>Aún no hay comprobantes emitidos</strong>
            <span>
              El historial se actualizará cuando envíes una factura o boleta.
            </span>
          </div>
        ) : (
          <div className="facturacion__tabla-contenedor">
            <table className="facturacion__tabla">
              <thead>
                <tr>
                  <th scope="col">Comprobante</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Total</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Actualizado</th>
                  <th scope="col">
                    <span className="visualmente-oculto">Documento</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {datos.comprobantes.map((comprobante) => (
                  <tr key={comprobante.id}>
                    <td>
                      <span className="facturacion__tipo-documento">
                        {comprobante.tipo === "factura" ? "Factura" : "Boleta"}
                      </span>
                      <span className="facturacion__mono">
                        {comprobante.serie}-
                        {String(comprobante.numero).padStart(8, "0")}
                      </span>
                    </td>
                    <td>{comprobante.clienteNombre}</td>
                    <td className="facturacion__mono">
                      {formatearImporte(comprobante.total, comprobante.moneda)}
                    </td>
                    <td>
                      <span className={claseEstado(comprobante)}>
                        {etiquetaEstado(comprobante)}
                      </span>
                      {comprobante.errorPublico ? (
                        <span className="facturacion__detalle-estado">
                          {comprobante.errorPublico}
                        </span>
                      ) : null}
                    </td>
                    <td>{formatearFecha(comprobante.actualizadoEn)}</td>
                    <td className="facturacion__accion">
                      {enlacePdfSeguro(comprobante.enlacePdf) ? (
                        <a
                          className="facturacion__enlace-pdf"
                          href={
                            enlacePdfSeguro(comprobante.enlacePdf) ?? undefined
                          }
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Ver PDF
                        </a>
                      ) : null}
                      {comprobante.estado === "error" ||
                      comprobante.estado === "emitiendo" ? (
                        <button
                          className="facturacion__enlace-accion"
                          disabled={operacionId !== null}
                          onClick={() => void reintentar(comprobante)}
                          type="button"
                        >
                          {operacionId === comprobante.ventaId
                            ? "Verificando…"
                            : comprobante.estado === "emitiendo"
                              ? "Verificar estado"
                              : "Reintentar"}
                        </button>
                      ) : null}
                      {comprobante.tipo === "boleta" &&
                      comprobante.estado === "emitido" &&
                      !fueAceptada(comprobante) ? (
                        <>
                          {puedeConsultarBoleta(comprobante) ? (
                            <button
                              className="facturacion__enlace-accion"
                              disabled={operacionId !== null}
                              onClick={() => void consultarBoleta(comprobante)}
                              type="button"
                            >
                              {operacionId === comprobante.id
                                ? "Consultando…"
                                : "Consultar aceptación"}
                            </button>
                          ) : (
                            <span className="facturacion__detalle-estado">
                              {consultaBoletaEnProceso(comprobante)
                                ? "Consulta en proceso."
                                : `Consulta disponible ${formatearFechaHora(fechaProximaConsulta(comprobante))}.`}
                            </span>
                          )}
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

async function leerErrorFuncion(error: { message: string; context?: unknown }) {
  if (error.context instanceof Response) {
    const respuesta = await error.context
      .clone()
      .json()
      .catch(() => null);
    if (
      respuesta &&
      typeof respuesta === "object" &&
      "detalle" in respuesta &&
      typeof respuesta.detalle === "string"
    ) {
      return respuesta.detalle;
    }
  }
  return error.message || "No se pudo completar la solicitud.";
}

function formatearImporte(importe: number, moneda: "PEN" | "USD") {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: moneda,
  }).format(importe);
}

function formatearFecha(fecha: string | Date | null) {
  if (!fecha) return "—";
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(valor);
}

function formatearFechaHora(fecha: Date | null) {
  if (!fecha || Number.isNaN(fecha.getTime())) return "más adelante";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha);
}

function fueAceptada(comprobante: ComprobanteFacturacion) {
  const respuesta =
    comprobante.tipo === "boleta"
      ? comprobante.respuestaConsultaSunat
      : comprobante.respuestaProveedor;
  return respuesta?.aceptada_por_sunat === true;
}

function etiquetaEstado(comprobante: ComprobanteFacturacion) {
  if (fueAceptada(comprobante)) return "Aceptada por SUNAT";
  if (comprobante.estado === "emitido" && comprobante.tipo === "boleta") {
    if (!comprobante.consultadoSunatEn) return "Enviada · aceptación pendiente";
    return comprobante.respuestaConsultaSunat
      ? "SUNAT aún pendiente"
      : "Sin resultado de consulta";
  }
  if (comprobante.estado === "emitido") return "Enviada a NubeFacT";
  if (comprobante.estado === "emitiendo") return "En proceso";
  if (comprobante.estado === "rechazado") return "Rechazada";
  if (comprobante.estado === "error") return "No se completó";
  return "Pendiente";
}

function claseEstado(comprobante: ComprobanteFacturacion) {
  if (fueAceptada(comprobante))
    return "facturacion__estado facturacion__estado--bien";
  if (comprobante.estado === "rechazado" || comprobante.estado === "error") {
    return "facturacion__estado facturacion__estado--error";
  }
  return "facturacion__estado facturacion__estado--pendiente";
}

function etiquetaDocumento(tipo: string | null, numero: string | null) {
  if (!numero) return "Sin documento";
  const etiqueta =
    tipo === "ruc"
      ? "RUC"
      : tipo === "dni"
        ? "DNI"
        : tipo === "ce"
          ? "CE"
          : tipo === "pasaporte"
            ? "Pasaporte"
            : "Documento";
  return `${etiqueta} ${numero}`;
}

function fechaProximaConsulta(
  comprobante: ComprobanteFacturacion,
): Date | null {
  if (!comprobante.consultaSunatDesde) return null;
  const primera = new Date(comprobante.consultaSunatDesde).getTime();
  const siguiente = comprobante.consultadoSunatEn
    ? new Date(comprobante.consultadoSunatEn).getTime() + 24 * 60 * 60 * 1000
    : 0;
  if (!Number.isFinite(primera) || !Number.isFinite(siguiente)) return null;
  return new Date(Math.max(primera, siguiente));
}

function puedeConsultarBoleta(comprobante: ComprobanteFacturacion) {
  if (consultaBoletaEnProceso(comprobante)) return false;
  const proxima = fechaProximaConsulta(comprobante);
  return proxima !== null && proxima.getTime() <= Date.now();
}

function consultaBoletaEnProceso(comprobante: ComprobanteFacturacion) {
  if (!comprobante.consultaEnProcesoHasta) return false;
  return new Date(comprobante.consultaEnProcesoHasta).getTime() > Date.now();
}

function enlacePdfSeguro(enlace: string | null) {
  if (!enlace) return null;
  try {
    const url = new URL(enlace);
    return url.protocol === "https:" &&
      (url.hostname === "nubefact.com" ||
        url.hostname.endsWith(".nubefact.com"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
