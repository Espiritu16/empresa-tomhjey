import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import {
  cargarResumenInicio,
  type ComprobantePendiente,
  type DiaVentas,
} from "@/funcionalidades/inicio/consultas";
import { formatearTotalesPorMoneda } from "@/compartido/formato-moneda";

export const metadata: Metadata = { title: "Inicio" };
export const instant = false;

type Moneda = "PEN" | "USD";
type Tendencia = "sube" | "baja" | "igual";

const ESTADO_VENTA: Record<string, { texto: string; tono: string }> = {
  confirmada: { texto: "Confirmada", tono: "bien" },
  borrador: { texto: "Borrador", tono: "duda" },
  descartada: { texto: "Descartada", tono: "neutro" },
};

const ESTADO_COMPROBANTE: Record<
  ComprobantePendiente["estado"],
  { texto: string; tono: string }
> = {
  pendiente: { texto: "Sin enviar", tono: "duda" },
  emitiendo: { texto: "En proceso", tono: "info" },
  rechazado: { texto: "Rechazado", tono: "peligro" },
  error: { texto: "Con error", tono: "peligro" },
};

export default async function InicioPanel() {
  await connection();
  const { datos, error } = await cargarResumenInicio();

  if (!datos) {
    return (
      <>
        <Encabezado />
        <p className="modulo-operativo__aviso modulo-operativo__aviso--error">
          {error}
        </p>
      </>
    );
  }

  const base = datos.monedaBase;
  const totalHoy = datos.hoy.totales[base] ?? 0;
  const totalAyer = datos.ayer.totales[base] ?? 0;
  const ventasSemana = datos.semana.reduce((suma, dia) => suma + dia.ventas, 0);
  const totalSemana = datos.semana.reduce(
    (suma, dia) => suma + (dia.totales[base] ?? 0),
    0,
  );
  const diaDelMes = Number(datos.fechaHoy.slice(8, 10));
  const diasDelMes = new Date(
    Number(datos.fechaHoy.slice(0, 4)),
    Number(datos.fechaHoy.slice(5, 7)),
    0,
  ).getDate();

  return (
    <>
      <Encabezado fecha={datos.fechaHoy} />

      <section
        aria-label="Indicadores de la empresa"
        className="tarjetas-indicadores"
      >
        <Indicador
          rotulo="Vendido hoy"
          valor={formatearTotalesPorMoneda(datos.hoy.totales, base)}
          comparacion={compararPorcentaje(totalHoy, totalAyer)}
        />
        <Indicador
          rotulo="Ventas confirmadas hoy"
          valor={String(datos.hoy.ventas)}
          comparacion={compararCantidad(datos.hoy.ventas, datos.ayer.ventas)}
        />
        <Indicador
          rotulo="Ticket promedio"
          valor={
            ventasSemana
              ? formatearImporte(totalSemana / ventasSemana, base)
              : "—"
          }
          nota={`${ventasSemana} ventas en los últimos 7 días`}
        />
        <Indicador
          rotulo="Vendido este mes"
          valor={formatearTotalesPorMoneda(datos.mes.totales, base)}
          nota={`${datos.mes.ventas} ventas · día ${diaDelMes} de ${diasDelMes}`}
        />
      </section>

      <div className="tablero tablero--grafico">
        <section aria-labelledby="grafico-titulo" className="tarjeta-panel">
          <div className="tarjeta-panel__encabezado">
            <h2 id="grafico-titulo">Ventas de los últimos 7 días</h2>
            <Link href="/panel/reportes">Ver reportes</Link>
          </div>
          <GraficoSemana
            dias={datos.semana}
            hoy={datos.fechaHoy}
            moneda={base}
          />
        </section>

        <section aria-labelledby="top-titulo" className="tarjeta-panel">
          <div className="tarjeta-panel__encabezado">
            <h2 id="top-titulo">Más vendidos del mes</h2>
          </div>
          {datos.topProductos.length ? (
            <ol className="ranking">
              {datos.topProductos.map((producto) => (
                <li key={producto.descripcion}>
                  <div className="ranking__fila">
                    <span>{producto.descripcion}</span>
                    <strong>{formatearCantidad(producto.unidades)} u.</strong>
                  </div>
                  <span aria-hidden="true" className="ranking__barra">
                    <span
                      style={{
                        width: `${(producto.unidades / datos.topProductos[0].unidades) * 100}%`,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Vacio texto="Aún no hay ventas confirmadas este mes." />
          )}
        </section>
      </div>

      <div className="tablero tablero--listas">
        <section aria-labelledby="reponer-titulo" className="tarjeta-panel">
          <div className="tarjeta-panel__encabezado">
            <h2 id="reponer-titulo">
              Por reponer
              {datos.totalPorReponer ? (
                <span className="contador">{datos.totalPorReponer}</span>
              ) : null}
            </h2>
            <Link href="/panel/inventario">Inventario</Link>
          </div>
          {datos.porReponer.length ? (
            <ul className="lista-tablero">
              {datos.porReponer.map((articulo) => (
                <li key={articulo.id}>
                  <span className="lista-tablero__texto">
                    {articulo.nombre}
                  </span>
                  {articulo.existencias <= 0 ? (
                    <Estado tono="peligro" texto="Sin stock" />
                  ) : (
                    <Estado
                      tono="duda"
                      texto={`${formatearCantidad(articulo.existencias)} de mín. ${formatearCantidad(articulo.stockMinimo)}`}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Vacio texto="Todos los productos tienen stock suficiente." />
          )}
        </section>

        <section
          aria-labelledby="comprobantes-titulo"
          className="tarjeta-panel"
        >
          <div className="tarjeta-panel__encabezado">
            <h2 id="comprobantes-titulo">
              Comprobantes pendientes
              {datos.totalComprobantes ? (
                <span className="contador">{datos.totalComprobantes}</span>
              ) : null}
            </h2>
            <Link href="/panel/facturacion">Facturación</Link>
          </div>
          {datos.comprobantes.length ? (
            <ul className="lista-tablero">
              {datos.comprobantes.map((comprobante) => {
                const estado = ESTADO_COMPROBANTE[comprobante.estado];
                return (
                  <li key={comprobante.id}>
                    <span className="lista-tablero__texto">
                      {comprobante.tipo === "factura" ? "Factura" : "Boleta"}{" "}
                      {comprobante.serie}-{comprobante.numero}
                    </span>
                    <Estado tono={estado.tono} texto={estado.texto} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <Vacio texto="Todos los comprobantes se enviaron correctamente." />
          )}
        </section>

        <section aria-labelledby="actividad-titulo" className="tarjeta-panel">
          <div className="tarjeta-panel__encabezado">
            <h2 id="actividad-titulo">Últimas ventas</h2>
            <Link href="/panel/ventas">Ver ventas</Link>
          </div>
          {datos.recientes.length ? (
            <ul className="lista-tablero">
              {datos.recientes.map((venta) => {
                const estado = ESTADO_VENTA[venta.estado] ?? {
                  texto: venta.estado,
                  tono: "neutro",
                };
                return (
                  <li key={venta.id}>
                    <span className="lista-tablero__texto">
                      <strong>
                        {venta.clienteNombre ?? "Venta de mostrador"}
                      </strong>
                      <small>{formatearFecha(venta.fecha)}</small>
                    </span>
                    <span className="lista-tablero__importe">
                      {formatearImporte(venta.total, venta.moneda)}
                      <Estado tono={estado.tono} texto={estado.texto} />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Vacio texto="Las ventas que registres aparecerán aquí." />
          )}
        </section>
      </div>
    </>
  );
}

function Encabezado({ fecha }: { fecha?: string }) {
  return (
    <div className="encabezado-seccion">
      <div>
        <h1>Inicio</h1>
        {fecha ? (
          <p className="encabezado-seccion__texto">
            Hoy, {formatearDia(fecha)}
          </p>
        ) : null}
      </div>
      <div className="encabezado-seccion__acciones">
        <Link
          className="modulo-operativo__boton-secundario"
          href="/panel/productos"
        >
          Ir a productos
        </Link>
        <Link className="boton-principal" href="/panel/ventas">
          Ir a ventas
        </Link>
      </div>
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  comparacion,
  nota,
}: {
  rotulo: string;
  valor: string;
  comparacion?: { texto: string; tendencia: Tendencia };
  nota?: string;
}) {
  return (
    <article className="tarjeta-indicador">
      <p className="tarjeta-indicador__rotulo">{rotulo}</p>
      <p className="tarjeta-indicador__valor">{valor}</p>
      {comparacion ? (
        <p
          className={`tarjeta-indicador__nota tarjeta-indicador__nota--${comparacion.tendencia}`}
        >
          {comparacion.texto}
        </p>
      ) : (
        <p className="tarjeta-indicador__nota">{nota}</p>
      )}
    </article>
  );
}

function GraficoSemana({
  dias,
  hoy,
  moneda,
}: {
  dias: DiaVentas[];
  hoy: string;
  moneda: Moneda;
}) {
  const maximo = Math.max(...dias.map((dia) => dia.totales[moneda] ?? 0), 0);
  const otraMoneda = dias.some((dia) =>
    Object.keys(dia.totales).some((clave) => clave !== moneda),
  );

  return (
    <figure className="grafico">
      <div className="grafico__barras">
        {dias.map((dia) => {
          const total = dia.totales[moneda] ?? 0;
          const etiqueta = `${formatearDia(dia.fecha)}: ${formatearImporte(total, moneda)}, ${dia.ventas} ${dia.ventas === 1 ? "venta" : "ventas"}`;
          // La barra más alta llega al 85% para dejar sitio al monto encima.
          const altura = maximo ? Math.max((total / maximo) * 85, 2) : 2;
          return (
            <div
              aria-label={etiqueta}
              className={`grafico__columna${dia.fecha === hoy ? " grafico__columna--hoy" : ""}`}
              key={dia.fecha}
              role="img"
              title={etiqueta}
            >
              <span className="grafico__pista">
                {total ? (
                  <span className="grafico__valor">
                    {formatearImporteCorto(total, moneda)}
                  </span>
                ) : null}
                <span
                  className="grafico__barra"
                  style={{ "--proporcion": altura } as React.CSSProperties}
                />
              </span>
              <span className="grafico__dia">
                {dia.fecha === hoy ? "Hoy" : formatearDiaCorto(dia.fecha)}
              </span>
            </div>
          );
        })}
      </div>
      <figcaption className="grafico__pie">
        {maximo
          ? `Ventas confirmadas en ${moneda === "PEN" ? "soles" : "dólares"}.`
          : "Aún no hay ventas confirmadas en estos días."}
        {otraMoneda ? " Las ventas en otra moneda se ven en Reportes." : ""}
      </figcaption>
    </figure>
  );
}

function Estado({ tono, texto }: { tono: string; texto: string }) {
  return <span className={`estado estado--${tono}`}>{texto}</span>;
}

function Vacio({ texto }: { texto: string }) {
  return <p className="tablero__vacio">{texto}</p>;
}

function compararPorcentaje(
  actual: number,
  anterior: number,
): { texto: string; tendencia: Tendencia } {
  if (!anterior) {
    return {
      texto: actual ? "Ayer no hubo ventas" : "Sin ventas hoy ni ayer",
      tendencia: "igual",
    };
  }
  const cambio = Math.round(((actual - anterior) / anterior) * 100);
  if (cambio === 0) return { texto: "Igual que ayer", tendencia: "igual" };
  return cambio > 0
    ? { texto: `▲ ${cambio}% respecto de ayer`, tendencia: "sube" }
    : { texto: `▼ ${Math.abs(cambio)}% respecto de ayer`, tendencia: "baja" };
}

function compararCantidad(
  actual: number,
  anterior: number,
): { texto: string; tendencia: Tendencia } {
  const diferencia = actual - anterior;
  if (diferencia === 0) return { texto: "Igual que ayer", tendencia: "igual" };
  return diferencia > 0
    ? { texto: `▲ ${diferencia} más que ayer`, tendencia: "sube" }
    : { texto: `▼ ${Math.abs(diferencia)} menos que ayer`, tendencia: "baja" };
}

function formatearImporte(importe: number, moneda: Moneda = "PEN"): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: moneda,
  }).format(importe);
}

function formatearImporteCorto(importe: number, moneda: Moneda): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: moneda,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(importe);
}

function formatearCantidad(cantidad: number): string {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(
    cantidad,
  );
}

/** Mediodía en Lima, para que el día no cambie al formatear. */
function fechaMediodia(fecha: string) {
  return new Date(`${fecha}T12:00:00-05:00`);
}

function formatearDia(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(fechaMediodia(fecha));
}

function formatearDiaCorto(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    weekday: "short",
    day: "numeric",
  }).format(fechaMediodia(fecha));
}

function formatearFecha(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(fecha));
}
