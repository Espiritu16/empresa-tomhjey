import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { cargarResumenInicio } from "@/funcionalidades/inicio/consultas";
import { formatearTotalesPorMoneda } from "@/compartido/formato-moneda";

export const metadata: Metadata = { title: "Inicio" };
export const instant = false;

export default async function InicioPanel() {
  await connection();
  const datos = await cargarResumenInicio();
  const resumen = datos.resumen;
  const indicadores = [
    {
      rotulo: "VENTAS DE HOY",
      valor: resumen ? String(resumen.ventas) : "—",
      nota: resumen ? "Ventas confirmadas" : "No se pudo cargar el resumen",
    },
    {
      rotulo: "TOTAL DE HOY",
      valor: resumen
        ? formatearTotalesPorMoneda(
            resumen.totalesPorMoneda,
            resumen.monedaBase,
          )
        : "—",
      nota: "Importe de ventas confirmadas",
    },
    {
      rotulo: "PRODUCTOS",
      valor: String(datos.productos),
      nota: "Productos activos en el catálogo",
    },
    {
      rotulo: "POR REPONER",
      valor: resumen ? String(resumen.stockBajo) : "—",
      nota: "Productos bajo el mínimo",
    },
  ];
  return (
    <>
      <div className="encabezado-seccion">
        <div>
          <p className="rotulo">RESUMEN DE LA EMPRESA</p>
          <h1>Inicio</h1>
          <p className="encabezado-seccion__texto">
            Desde aquí puedes acceder a las tareas principales del negocio.
          </p>
        </div>
      </div>

      <section
        aria-label="Indicadores de la empresa"
        className="tarjetas-indicadores"
      >
        {indicadores.map((indicador) => (
          <article className="tarjeta-indicador" key={indicador.rotulo}>
            <p className="tarjeta-indicador__rotulo">{indicador.rotulo}</p>
            <p className="tarjeta-indicador__valor">{indicador.valor}</p>
            <p className="tarjeta-indicador__nota">{indicador.nota}</p>
          </article>
        ))}
      </section>

      <div className="reja-inicio">
        <section aria-labelledby="actividad-titulo" className="tarjeta-panel">
          <div className="tarjeta-panel__encabezado">
            <div>
              <p className="rotulo">MOVIMIENTO RECIENTE</p>
              <h2 id="actividad-titulo">Actividad</h2>
            </div>
            <Link href="/panel/ventas">Ver ventas</Link>
          </div>
          {datos.recientes.length ? (
            <div className="actividad-lista">
              {datos.recientes.map((venta) => (
                <article className="actividad-lista__fila" key={venta.id}>
                  <span aria-hidden="true" className="actividad-lista__simbolo">
                    ↗
                  </span>
                  <div className="actividad-lista__detalle">
                    <strong>
                      {venta.clienteNombre ?? "Venta de mostrador"}
                    </strong>
                    <span>
                      {venta.estado === "confirmada"
                        ? "Venta confirmada"
                        : venta.estado === "borrador"
                          ? "Borrador"
                          : "Venta descartada"}{" "}
                      · {formatearFecha(venta.fecha)}
                    </span>
                  </div>
                  <span className="actividad-lista__importe">
                    {formatearImporte(venta.total, venta.moneda)}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <div className="actividad-vacia">
              <span aria-hidden="true" className="actividad-vacia__simbolo">
                ↗
              </span>
              <strong>Aún no hay ventas</strong>
              <span>Las ventas recientes aparecerán aquí.</span>
            </div>
          )}
        </section>

        <AsistenteResumen />
      </div>
    </>
  );
}

function AsistenteResumen() {
  return (
    <section aria-labelledby="asistente-titulo" className="asistente-panel">
      <span aria-hidden="true" className="asistente-panel__icono">
        ✳
      </span>
      <p className="rotulo" style={{ marginTop: "1rem" }}>
        ASISTENCIA INTELIGENTE
      </p>
      <h2 id="asistente-titulo">Asistente para tu empresa</h2>
      <p>
        Consulta ventas, existencias y productos o prepara un borrador con ayuda
        de la IA.
      </p>
      <div
        aria-label="Ejemplos de consultas"
        className="asistente-panel__sugerencias"
      >
        <span>¿Qué productos debo reponer?</span>
        <span>Resume las ventas de hoy</span>
      </div>
      <Link
        className="boton-principal"
        href="/panel/asistente"
        style={{ marginTop: "1.1rem" }}
      >
        Ver el asistente
      </Link>
    </section>
  );
}

function formatearImporte(importe: number, moneda = "PEN"): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: moneda,
  }).format(importe);
}

function formatearFecha(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(fecha));
}
