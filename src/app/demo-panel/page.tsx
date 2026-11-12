import { notFound } from "next/navigation";
import { PanelShell } from "@/funcionalidades/panel/panel-shell";

export default function VistaPreviaPanel() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <PanelShell
      perfil={{ nombre: "María Torres", rol: "administrador" }}
      vistaPrevia
    >
      <div className="encabezado-seccion">
        <div>
          <p className="rotulo">RESUMEN DE LA EMPRESA</p>
          <h1>Inicio</h1>
          <p className="encabezado-seccion__texto">
            Desde aquí puedes acceder a las tareas principales del negocio.
          </p>
        </div>
        <span className="etiqueta-vista-previa">Datos de muestra</span>
      </div>

      <section
        aria-label="Indicadores de muestra"
        className="tarjetas-indicadores"
      >
        <Indicador
          rotulo="VENTAS DE HOY"
          valor="S/ 1,240.00"
          nota="8 ventas registradas"
        />
        <Indicador rotulo="PRODUCTOS" valor="128" nota="En el catálogo" />
        <Indicador
          rotulo="POR REPONER"
          valor="6"
          nota="Productos con poco stock"
        />
      </section>

      <section aria-labelledby="actividad-titulo" className="tarjeta-panel">
        <div className="tarjeta-panel__encabezado">
          <div>
            <p className="rotulo">MOVIMIENTO RECIENTE</p>
            <h2 id="actividad-titulo">Actividad</h2>
          </div>
          <span className="rotulo">HOY</span>
        </div>
        <div aria-label="Últimas ventas" className="actividad-lista">
          <VentaReciente numero="1048" hora="Hace 10 min" importe="S/ 245.00" />
          <VentaReciente numero="1047" hora="Hace 34 min" importe="S/ 180.00" />
          <VentaReciente numero="1046" hora="Hace 1 h" importe="S/ 96.00" />
        </div>
      </section>
    </PanelShell>
  );
}

function Indicador({
  rotulo,
  valor,
  nota,
}: {
  rotulo: string;
  valor: string;
  nota: string;
}) {
  return (
    <article className="tarjeta-indicador">
      <p className="tarjeta-indicador__rotulo">{rotulo}</p>
      <p className="tarjeta-indicador__valor">{valor}</p>
      <p className="tarjeta-indicador__nota">{nota}</p>
    </article>
  );
}

function VentaReciente({
  numero,
  hora,
  importe,
}: {
  numero: string;
  hora: string;
  importe: string;
}) {
  return (
    <article className="actividad-lista__fila">
      <span aria-hidden="true" className="actividad-lista__simbolo">
        ✓
      </span>
      <div className="actividad-lista__detalle">
        <strong>Venta #{numero}</strong>
        <span>{hora} · Confirmada</span>
      </div>
      <span className="actividad-lista__importe">{importe}</span>
    </article>
  );
}
