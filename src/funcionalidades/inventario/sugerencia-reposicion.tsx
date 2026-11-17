"use client";

import { useState } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import { DialogoModal } from "@/compartido/componentes/dialogo-modal";

/**
 * Sugerencia de reposición con el modelo de demanda del APF3.
 * No pide datos: la Edge Function `prediccion-demanda` toma, con la sesión del
 * usuario, las ventas confirmadas de las últimas 4 semanas, el stock, el precio y
 * el stock mínimo de cada producto vinculado al catálogo del modelo.
 */

type Resultado = {
  semana: string;
  evento: string;
  unidades_estimadas: number;
  unidades_estimadas_redondeadas: number;
  cobertura_semanas: number;
  reposicion_sugerida: number;
  accion: "reponer" | "stock suficiente";
};

type Fila = {
  producto_id: string;
  sku: string;
  nombre: string;
  modelo_producto: string;
  modelo_talla: string;
  ventas_ultimas_4_semanas: number[];
  stock_actual: number;
  stock_seguridad: number;
  hubo_quiebre_semana_anterior: boolean;
  resultado: Resultado | null;
  error: string | null;
};

type Respuesta = {
  semana: string;
  modelo: string;
  mae_prueba: number;
  productos: Fila[];
  productos_sin_vincular: number;
  productos_con_variantes: number;
};

function formatearLunes(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${fecha}T12:00:00`));
}

function formatearNumero(valor: number): string {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(
    valor,
  );
}

async function leerError(error: {
  message: string;
  context?: unknown;
}): Promise<string> {
  if (error.context instanceof Response) {
    try {
      const cuerpo = (await error.context.clone().json()) as {
        detalle?: string;
      };
      if (cuerpo.detalle) return cuerpo.detalle;
    } catch {
      // Respuesta sin JSON: se usa el mensaje genérico.
    }
  }
  return "No se pudo calcular la reposición. Inténtalo de nuevo.";
}

export function SugerenciaReposicion() {
  const [abierto, setAbierto] = useState(false);
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function calcular() {
    setCargando(true);
    setError(null);
    const { data, error: errorFuncion } =
      await crearClienteSupabase().functions.invoke("prediccion-demanda", {
        body: { consulta: "reposicion" },
      });
    setCargando(false);
    if (errorFuncion || !Array.isArray(data?.productos)) {
      setError(
        errorFuncion
          ? await leerError(errorFuncion)
          : "El modelo no devolvió sugerencias.",
      );
      return;
    }
    setRespuesta(data as Respuesta);
  }

  function abrir() {
    setAbierto(true);
    void calcular();
  }

  const porReponer =
    respuesta?.productos.filter((fila) => fila.resultado?.accion === "reponer")
      .length ?? 0;

  return (
    <>
      <button
        className="modulo-operativo__boton-secundario"
        onClick={abrir}
        type="button"
      >
        Sugerir reposición
      </button>
      <DialogoModal
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Sugerir reposición"
      >
        <div className="sugerencia-reposicion">
          {respuesta ? (
            <p className="sugerencia-reposicion__ayuda">
              Semana del {formatearLunes(respuesta.semana)}. Se calculó con las
              ventas confirmadas de las 4 semanas anteriores, el stock actual y
              el stock mínimo de cada producto. Modelo {respuesta.modelo}, error
              medio de ±{respuesta.mae_prueba} unidades por semana. Es una
              sugerencia: la decisión de compra es tuya.
            </p>
          ) : (
            <p className="sugerencia-reposicion__ayuda" role="status">
              {cargando
                ? "Calculando con las ventas registradas…"
                : "Calcula cuánto conviene pedir de cada producto vinculado al modelo de demanda."}
            </p>
          )}

          {error ? (
            <p
              className="modulo-operativo__aviso modulo-operativo__aviso--error"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {respuesta && respuesta.productos.length === 0 ? (
            <div className="modulo-operativo__vacio" role="status">
              <strong>Aún no hay productos vinculados al modelo</strong>
              <span>
                El modelo conoce el catálogo de pantalones y shorts de Tomhjey
                Jeans. Para ver la sugerencia, en Productos crea o edita un
                producto de ese catálogo (un producto por talla) y elige su
                «Vínculo con el modelo de demanda».
              </span>
              <MotivosSinVinculo respuesta={respuesta} />
            </div>
          ) : null}

          {respuesta && respuesta.productos.length > 0 ? (
            <>
              <p className="sugerencia-reposicion__resumen">
                <strong>{porReponer}</strong>{" "}
                {porReponer === 1
                  ? "producto conviene reponer"
                  : "productos conviene reponer"}{" "}
                de {respuesta.productos.length} vinculados.
              </p>
              <MotivosSinVinculo respuesta={respuesta} />
              <div className="modulo-operativo__tabla-contenedor">
                <table className="modulo-operativo__tabla">
                  <thead>
                    <tr>
                      <th scope="col">Producto</th>
                      <th scope="col">Ventas últimas 4 semanas</th>
                      <th scope="col">Stock</th>
                      <th scope="col">Se estima vender</th>
                      <th scope="col">Sugerencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {respuesta.productos.map((fila) => (
                      <tr key={fila.producto_id}>
                        <td data-etiqueta="Producto" data-principal>
                          <strong>{fila.nombre}</strong>
                          <small className="modulo-operativo__detalle">
                            {fila.sku} · modelo {fila.modelo_producto} talla{" "}
                            {fila.modelo_talla}
                          </small>
                        </td>
                        <td data-etiqueta="Ventas últimas 4 semanas">
                          <span className="celda-con-detalle">
                            {fila.ventas_ultimas_4_semanas
                              .map(formatearNumero)
                              .join(" · ")}
                            {fila.hubo_quiebre_semana_anterior ? (
                              <small className="modulo-operativo__detalle">
                                Se agotó la semana pasada
                              </small>
                            ) : null}
                          </span>
                        </td>
                        <td data-etiqueta="Stock">
                          <span className="celda-con-detalle">
                            {formatearNumero(fila.stock_actual)}
                            <small className="modulo-operativo__detalle">
                              mínimo {formatearNumero(fila.stock_seguridad)}
                            </small>
                          </span>
                        </td>
                        <td data-etiqueta="Se estima vender">
                          {fila.resultado
                            ? `${formatearNumero(Math.round(fila.resultado.unidades_estimadas * 10) / 10)} u.`
                            : "—"}
                        </td>
                        <td data-etiqueta="Sugerencia">
                          {fila.resultado ? (
                            fila.resultado.accion === "reponer" ? (
                              <span className="estado estado--duda">
                                Pedir {fila.resultado.reposicion_sugerida} u.
                              </span>
                            ) : (
                              <span className="estado estado--bien">
                                Stock suficiente
                              </span>
                            )
                          ) : (
                            <span className="estado estado--peligro">
                              {fila.error ?? "Sin cálculo"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <div className="modulo-operativo__acciones modulo-operativo__acciones--dialogo">
            <button
              className="modulo-operativo__boton-secundario"
              onClick={() => setAbierto(false)}
              type="button"
            >
              Cerrar
            </button>
            <button
              className="boton-principal"
              disabled={cargando}
              onClick={() => void calcular()}
              type="button"
            >
              {cargando ? "Calculando…" : "Volver a calcular"}
            </button>
          </div>
        </div>
      </DialogoModal>
    </>
  );
}

/** Explica por qué algunos productos no aparecen en la sugerencia. */
function MotivosSinVinculo({ respuesta }: { respuesta: Respuesta }) {
  const sinVincular = respuesta.productos_sin_vincular;
  const conVariantes = respuesta.productos_con_variantes;
  if (!sinVincular && !conVariantes) return null;
  return (
    <ul className="sugerencia-reposicion__motivos">
      {sinVincular ? (
        <li>
          {sinVincular === 1
            ? "1 producto no tiene vínculo: si es del catálogo de pantalones y shorts, edítalo en Productos y elige su vínculo."
            : `${sinVincular} productos no tienen vínculo: si son del catálogo de pantalones y shorts, edítalos en Productos y elige su vínculo.`}
        </li>
      ) : null}
      {conVariantes ? (
        <li>
          {conVariantes === 1
            ? "1 producto tiene variantes de talla o color y todavía no se puede vincular; por ahora el vínculo es para productos simples."
            : `${conVariantes} productos tienen variantes de talla o color y todavía no se pueden vincular; por ahora el vínculo es para productos simples.`}
        </li>
      ) : null}
    </ul>
  );
}
