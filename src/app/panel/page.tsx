import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Inicio" };

const indicadores = [
  {
    rotulo: "VENTAS DE HOY",
    valor: "—",
    nota: "Se mostrará al conectar la actividad",
  },
  { rotulo: "PRODUCTOS", valor: "—", nota: "Catálogo de la empresa" },
  { rotulo: "POR REPONER", valor: "—", nota: "Alertas de existencias" },
];

export default function InicioPanel() {
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
          <div className="actividad-vacia">
            <span aria-hidden="true" className="actividad-vacia__simbolo">
              ↗
            </span>
            <strong>Tu actividad aparecerá aquí</strong>
            <span>
              Cuando registres ventas, podrás consultarlas desde este resumen.
            </span>
          </div>
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
        Estamos preparando la asistencia en lenguaje natural para tus ventas e
        inventario.
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
