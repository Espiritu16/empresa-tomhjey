"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import type {
  ComprobanteFactura,
  PaginaFacturacion as DatosFacturacion,
  VentaFacturable,
} from "./consultas";

type Propiedades = { datos: DatosFacturacion };

export function PaginaFacturacion({ datos }: Propiedades) {
  const router = useRouter();
  const [serie, setSerie] = useState(datos.serie?.serie ?? "");
  const [siguienteNumero, setSiguienteNumero] = useState(
    datos.serie ? String(datos.serie.siguienteNumero) : "",
  );
  const [guardandoSerie, setGuardandoSerie] = useState(false);
  const [operacionVenta, setOperacionVenta] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(datos.error);

  async function guardarSerie(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setMensaje(null);

    const numero = Number(siguienteNumero);
    if (!/^F[A-Z0-9]{3}$/.test(serie.trim().toUpperCase())) {
      setError(
        "La serie de factura debe tener cuatro caracteres, por ejemplo F001.",
      );
      return;
    }
    if (!Number.isSafeInteger(numero) || numero <= 0) {
      setError(
        "Escribe el siguiente correlativo como un número entero positivo.",
      );
      return;
    }

    setGuardandoSerie(true);
    try {
      const supabase = crearClienteSupabase();
      const { data: respuesta, error: errorFuncion } =
        await supabase.functions.invoke("facturacion", {
          body: {
            operacion: "configurar_serie",
            serie: serie.trim().toUpperCase(),
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
      router.refresh();
    } catch {
      setError("No se pudo guardar la serie. Inténtalo de nuevo.");
    } finally {
      setGuardandoSerie(false);
    }
  }

  async function emitir(venta: VentaFacturable) {
    await ejecutarEmision(venta.id, venta.clienteNombre, "Emitir factura");
  }

  async function reintentar(comprobante: ComprobanteFactura) {
    await ejecutarEmision(
      comprobante.ventaId,
      comprobante.clienteNombre,
      "Reintentar factura",
    );
  }

  async function ejecutarEmision(
    ventaId: string,
    clienteNombre: string,
    accion: string,
  ) {
    setError(null);
    setMensaje(null);
    setOperacionVenta(ventaId);

    try {
      const supabase = crearClienteSupabase();
      const { data: respuesta, error: errorFuncion } =
        await supabase.functions.invoke("facturacion", {
          body: { ventaId, tipo: "factura" },
        });

      if (errorFuncion) {
        setError(await leerErrorFuncion(errorFuncion));
        router.refresh();
        return;
      }

      setMensaje(
        respuesta.estado === "emitiendo"
          ? `La factura de ${clienteNombre} sigue en proceso. Puedes verificar su resultado sin cambiar el correlativo.`
          : respuesta.aceptadaPorSunat === true
            ? `La factura de ${clienteNombre} fue aceptada por SUNAT.`
            : `La factura de ${clienteNombre} se envió a NubeFacT. La respuesta aún no confirma aceptación de SUNAT.`,
      );
      router.refresh();
    } catch {
      setError(
        `No se pudo completar «${accion.toLowerCase()}». Puedes volver a intentarlo.`,
      );
      router.refresh();
    } finally {
      setOperacionVenta(null);
    }
  }

  const puedeEmitir = Boolean(datos.serie && datos.empresa?.ruc);
  const aceptadas = datos.comprobantes.filter(
    (comprobante) =>
      comprobante.respuestaProveedor?.aceptada_por_sunat === true,
  ).length;
  const pendientes = datos.comprobantes.filter(
    (comprobante) =>
      comprobante.estado === "emitiendo" ||
      (comprobante.estado === "emitido" &&
        comprobante.respuestaProveedor?.aceptada_por_sunat !== true),
  ).length;

  return (
    <div className="facturacion">
      <header className="encabezado-seccion">
        <div>
          <p className="rotulo">DOCUMENTOS FISCALES</p>
          <h1>Facturación</h1>
          <p className="encabezado-seccion__texto">
            Emite facturas de tus ventas confirmadas y consulta la respuesta de
            NubeFacT.
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
            Completa los datos fiscales de la empresa antes de emitir una
            factura.
          </p>
        </section>
      ) : null}

      <section
        aria-label="Resumen de facturación"
        className="facturacion__resumen"
      >
        <article className="facturacion__indicador">
          <span>FACTURAS REGISTRADAS</span>
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

      <section aria-labelledby="serie-titulo" className="facturacion__tarjeta">
        <div className="facturacion__titulo-bloque">
          <div>
            <p className="rotulo">CONFIGURACIÓN FISCAL</p>
            <h2 id="serie-titulo">Serie de factura</h2>
          </div>
          {datos.serie ? (
            <span className="facturacion__serie-activa">
              {datos.serie.serie}
            </span>
          ) : null}
        </div>
        <p className="facturacion__descripcion">
          Usa la serie y el siguiente correlativo habilitados en tu cuenta de
          NubeFacT. El sistema no permite retroceder el número.
        </p>
        <form className="facturacion__formulario-serie" onSubmit={guardarSerie}>
          <label>
            <span>Serie</span>
            <input
              autoComplete="off"
              maxLength={4}
              onChange={(evento) => setSerie(evento.target.value.toUpperCase())}
              pattern="F[A-Z0-9]{3}"
              placeholder="F001"
              required
              value={serie}
            />
          </label>
          <label>
            <span>Siguiente correlativo</span>
            <input
              inputMode="numeric"
              min="1"
              onChange={(evento) => setSiguienteNumero(evento.target.value)}
              placeholder="1"
              required
              step="1"
              type="number"
              value={siguienteNumero}
            />
          </label>
          <button
            className="boton-principal"
            disabled={guardandoSerie}
            type="submit"
          >
            {guardandoSerie ? "Guardando…" : "Guardar serie"}
          </button>
        </form>
      </section>

      <section
        aria-labelledby="ventas-facturables-titulo"
        className="facturacion__tarjeta"
      >
        <div className="facturacion__titulo-bloque">
          <div>
            <p className="rotulo">VENTAS CONFIRMADAS</p>
            <h2 id="ventas-facturables-titulo">Listas para facturar</h2>
          </div>
          <span className="facturacion__contador">
            {datos.ventasElegibles.length}
          </span>
        </div>
        {!puedeEmitir ? (
          <p className="facturacion__nota">
            Configura la serie y completa el RUC de la empresa para habilitar la
            emisión.
          </p>
        ) : null}
        {datos.ventasElegibles.length === 0 ? (
          <div className="facturacion__vacio">
            <strong>No hay ventas listas para facturar</strong>
            <span>
              Aquí aparecerán las ventas confirmadas con RUC que aún no tengan
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
                  <th scope="col">RUC</th>
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
                    <td className="facturacion__mono">{venta.clienteRuc}</td>
                    <td className="facturacion__mono">
                      {formatearImporte(venta.total, venta.moneda)}
                    </td>
                    <td className="facturacion__accion">
                      <button
                        className="facturacion__boton-secundario"
                        disabled={!puedeEmitir || operacionVenta !== null}
                        onClick={() => void emitir(venta)}
                        type="button"
                      >
                        {operacionVenta === venta.id
                          ? "Enviando…"
                          : "Emitir factura"}
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
            <h2 id="historial-facturas-titulo">Facturas emitidas</h2>
          </div>
        </div>
        {datos.comprobantes.length === 0 ? (
          <div className="facturacion__vacio">
            <strong>Aún no hay facturas emitidas</strong>
            <span>El historial se actualizará cuando envíes una factura.</span>
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
                    <td className="facturacion__mono">
                      {comprobante.serie}-
                      {String(comprobante.numero).padStart(8, "0")}
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
                          disabled={operacionVenta !== null}
                          onClick={() => void reintentar(comprobante)}
                          type="button"
                        >
                          {operacionVenta === comprobante.ventaId
                            ? "Verificando…"
                            : comprobante.estado === "emitiendo"
                              ? "Verificar estado"
                              : "Reintentar"}
                        </button>
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

function formatearFecha(fecha: string | null) {
  if (!fecha) return "—";
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(valor);
}

function fueAceptada(comprobante: ComprobanteFactura) {
  return comprobante.respuestaProveedor?.aceptada_por_sunat === true;
}

function etiquetaEstado(comprobante: ComprobanteFactura) {
  if (fueAceptada(comprobante)) return "Aceptada por SUNAT";
  if (comprobante.estado === "emitido") return "Enviada a NubeFacT";
  if (comprobante.estado === "emitiendo") return "En proceso";
  if (comprobante.estado === "rechazado") return "Rechazada";
  if (comprobante.estado === "error") return "No se completó";
  return "Pendiente";
}

function claseEstado(comprobante: ComprobanteFactura) {
  if (fueAceptada(comprobante))
    return "facturacion__estado facturacion__estado--bien";
  if (comprobante.estado === "rechazado" || comprobante.estado === "error") {
    return "facturacion__estado facturacion__estado--error";
  }
  return "facturacion__estado facturacion__estado--pendiente";
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
