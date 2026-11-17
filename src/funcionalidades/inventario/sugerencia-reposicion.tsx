"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import { DialogoModal } from "@/compartido/componentes/dialogo-modal";

/**
 * Sugerencia de reposición con el modelo de demanda del APF3.
 * Llama a la Edge Function `prediccion-demanda` con la sesión del usuario.
 * El modelo conoce el catálogo de Tomhjey Jeans (P01–S08); por eso el producto
 * se elige de ese catálogo y no de los productos de demostración del MVP.
 */

type ProductoModelo = {
  producto_id: string;
  nombre: string;
  tallas: string[];
  precio_lista: number;
  tiempo_entrega_semanas: number;
};

type CatalogoModelo = {
  modelo: string;
  entrenado_hasta: string;
  mae_prueba: number;
  productos: ProductoModelo[];
};

type Resultado = {
  sku: string;
  semana: string;
  evento: string;
  unidades_estimadas: number;
  unidades_estimadas_redondeadas: number;
  cobertura_semanas: number;
  reposicion_sugerida: number;
  accion: "reponer" | "stock suficiente";
  modelo: string;
  mae_prueba: number;
};

type Formulario = {
  productoId: string;
  talla: string;
  semana: string;
  precioLista: string;
  descuentoPorcentaje: string;
  ventas: [string, string, string, string];
  huboQuiebre: boolean;
  stockActual: string;
  tiempoEntrega: string;
  stockSeguridad: string;
};

const ETIQUETAS_SEMANAS = [
  "Hace 4 semanas",
  "Hace 3 semanas",
  "Hace 2 semanas",
  "Semana pasada",
];

function fechaLocal(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Los próximos 4 lunes (incluye hoy si es lunes). */
function proximosLunes(): string[] {
  const hoy = new Date();
  const diasHastaLunes = (8 - hoy.getDay()) % 7;
  return Array.from({ length: 4 }, (_, i) => {
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() + diasHastaLunes + i * 7);
    return fechaLocal(lunes);
  });
}

function formatearLunes(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${fecha}T12:00:00`));
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
  return "No se pudo consultar el modelo de demanda. Inténtalo de nuevo.";
}

function formularioPara(producto: ProductoModelo, semana: string): Formulario {
  return {
    productoId: producto.producto_id,
    talla: producto.tallas[0] ?? "",
    semana,
    precioLista: String(producto.precio_lista),
    descuentoPorcentaje: "0",
    ventas: ["0", "0", "0", "0"],
    huboQuiebre: false,
    stockActual: "0",
    tiempoEntrega: String(producto.tiempo_entrega_semanas),
    stockSeguridad: "2",
  };
}

export function SugerenciaReposicion() {
  const [abierto, setAbierto] = useState(false);
  const [catalogo, setCatalogo] = useState<CatalogoModelo | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lunes = proximosLunes();
  const refResultado = useRef<HTMLElement>(null);

  useEffect(() => {
    // En pantallas pequeñas el resultado queda bajo el formulario: se lleva a la vista.
    if (resultado) {
      refResultado.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [resultado]);

  async function abrir() {
    setAbierto(true);
    setResultado(null);
    setError(null);
    if (catalogo) return;
    setCargando(true);
    const { data, error: errorFuncion } =
      await crearClienteSupabase().functions.invoke("prediccion-demanda", {
        body: { consulta: "catalogo" },
      });
    setCargando(false);
    if (errorFuncion || !data?.productos?.length) {
      setError(
        errorFuncion
          ? await leerError(errorFuncion)
          : "El modelo no devolvió su catálogo.",
      );
      return;
    }
    const datos = data as CatalogoModelo;
    setCatalogo(datos);
    setFormulario(formularioPara(datos.productos[0], lunes[0]));
  }

  function cambiar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setFormulario((actual) =>
      actual ? { ...actual, [campo]: valor } : actual,
    );
    setResultado(null);
  }

  function elegirProducto(productoId: string) {
    const producto = catalogo?.productos.find(
      (item) => item.producto_id === productoId,
    );
    if (!producto || !formulario) return;
    setFormulario({
      ...formularioPara(producto, formulario.semana),
      ventas: formulario.ventas,
      stockActual: formulario.stockActual,
      stockSeguridad: formulario.stockSeguridad,
    });
    setResultado(null);
  }

  async function consultar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    evento.stopPropagation();
    if (!formulario) return;
    setError(null);
    const ventas = formulario.ventas.map(Number);
    const numeros = [
      Number(formulario.precioLista),
      Number(formulario.descuentoPorcentaje),
      Number(formulario.stockActual),
      Number(formulario.tiempoEntrega),
      Number(formulario.stockSeguridad),
      ...ventas,
    ];
    if (numeros.some((valor) => !Number.isFinite(valor) || valor < 0)) {
      setError("Revisa que todos los números sean válidos y no negativos.");
      return;
    }
    const descuento = Number(formulario.descuentoPorcentaje) / 100;
    if (descuento > 0.5) {
      setError("El descuento no puede superar el 50 %.");
      return;
    }
    setCargando(true);
    const { data, error: errorFuncion } =
      await crearClienteSupabase().functions.invoke("prediccion-demanda", {
        body: {
          producto_id: formulario.productoId,
          talla: formulario.talla,
          semana: formulario.semana,
          precio_lista: Number(formulario.precioLista),
          descuento,
          ventas_ultimas_4_semanas: ventas,
          hubo_quiebre_semana_anterior: formulario.huboQuiebre,
          stock_actual: Number(formulario.stockActual),
          tiempo_entrega_semanas: Number(formulario.tiempoEntrega),
          stock_seguridad: Number(formulario.stockSeguridad),
        },
      });
    setCargando(false);
    if (errorFuncion || typeof data?.unidades_estimadas !== "number") {
      setError(
        errorFuncion
          ? await leerError(errorFuncion)
          : "El modelo no devolvió una predicción.",
      );
      return;
    }
    setResultado(data as Resultado);
  }

  const producto = catalogo?.productos.find(
    (item) => item.producto_id === formulario?.productoId,
  );

  return (
    <>
      <button
        className="modulo-operativo__boton-secundario"
        onClick={() => void abrir()}
        type="button"
      >
        Sugerir reposición
      </button>
      <DialogoModal
        abierto={abierto}
        bloqueado={cargando}
        onCerrar={() => setAbierto(false)}
        titulo="Sugerir reposición"
      >
        <form
          className="modulo-operativo__formulario sugerencia-reposicion"
          onSubmit={consultar}
        >
          <p className="modulo-operativo__ancho-completo sugerencia-reposicion__ayuda">
            El modelo de demanda estima cuántas unidades se venderán en la
            semana y cuántas conviene pedir. Usa el catálogo de Tomhjey Jeans
            con el que fue entrenado.
          </p>

          {!formulario ? (
            <p className="modulo-operativo__ancho-completo" role="status">
              {cargando ? "Cargando el catálogo del modelo…" : null}
            </p>
          ) : (
            <>
              <label className="campo">
                <span>Producto</span>
                <select
                  onChange={(evento) => elegirProducto(evento.target.value)}
                  value={formulario.productoId}
                >
                  {catalogo?.productos.map((item) => (
                    <option key={item.producto_id} value={item.producto_id}>
                      {item.producto_id} · {item.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Talla</span>
                <select
                  onChange={(evento) => cambiar("talla", evento.target.value)}
                  value={formulario.talla}
                >
                  {producto?.tallas.map((talla) => (
                    <option key={talla} value={talla}>
                      {talla}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Semana a pronosticar</span>
                <select
                  onChange={(evento) => cambiar("semana", evento.target.value)}
                  value={formulario.semana}
                >
                  {lunes.map((fecha) => (
                    <option key={fecha} value={fecha}>
                      {formatearLunes(fecha)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo">
                <span>Precio de lista (S/)</span>
                <input
                  inputMode="decimal"
                  min="0.01"
                  onChange={(evento) =>
                    cambiar("precioLista", evento.target.value)
                  }
                  step="0.01"
                  type="number"
                  value={formulario.precioLista}
                />
              </label>

              <fieldset className="modulo-operativo__ancho-completo sugerencia-reposicion__ventas">
                <legend>Unidades vendidas de esta talla</legend>
                {ETIQUETAS_SEMANAS.map((etiqueta, indice) => (
                  <label className="campo" key={etiqueta}>
                    <span>{etiqueta}</span>
                    <input
                      inputMode="numeric"
                      min="0"
                      onChange={(evento) => {
                        const ventas = [
                          ...formulario.ventas,
                        ] as Formulario["ventas"];
                        ventas[indice] = evento.target.value;
                        cambiar("ventas", ventas);
                      }}
                      step="1"
                      type="number"
                      value={formulario.ventas[indice]}
                    />
                  </label>
                ))}
              </fieldset>

              <label className="campo">
                <span>Stock actual</span>
                <input
                  inputMode="numeric"
                  min="0"
                  onChange={(evento) =>
                    cambiar("stockActual", evento.target.value)
                  }
                  type="number"
                  value={formulario.stockActual}
                />
              </label>
              <label className="campo">
                <span>Stock de seguridad</span>
                <input
                  inputMode="numeric"
                  min="0"
                  onChange={(evento) =>
                    cambiar("stockSeguridad", evento.target.value)
                  }
                  type="number"
                  value={formulario.stockSeguridad}
                />
              </label>
              <label className="campo">
                <span>Semanas que tarda el proveedor</span>
                <input
                  inputMode="numeric"
                  min="0"
                  onChange={(evento) =>
                    cambiar("tiempoEntrega", evento.target.value)
                  }
                  type="number"
                  value={formulario.tiempoEntrega}
                />
              </label>
              <label className="campo">
                <span>Descuento planificado (%)</span>
                <input
                  inputMode="numeric"
                  max="50"
                  min="0"
                  onChange={(evento) =>
                    cambiar("descuentoPorcentaje", evento.target.value)
                  }
                  type="number"
                  value={formulario.descuentoPorcentaje}
                />
              </label>
              <label className="modulo-operativo__ancho-completo sugerencia-reposicion__casilla">
                <input
                  checked={formulario.huboQuiebre}
                  onChange={(evento) =>
                    cambiar("huboQuiebre", evento.target.checked)
                  }
                  type="checkbox"
                />
                La semana pasada se agotó esta talla
              </label>
            </>
          )}

          {error ? (
            <p
              className="modulo-operativo__aviso modulo-operativo__aviso--error modulo-operativo__ancho-completo"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {resultado ? (
            <section
              ref={refResultado}
              aria-live="polite"
              className="modulo-operativo__ancho-completo sugerencia-reposicion__resultado"
            >
              <div>
                <span>Se estima vender</span>
                <strong>{resultado.unidades_estimadas_redondeadas} u.</strong>
                <small>
                  {resultado.unidades_estimadas} en la semana del{" "}
                  {formatearLunes(resultado.semana)}
                  {resultado.evento !== "Ninguno"
                    ? ` · ${resultado.evento}`
                    : ""}
                </small>
              </div>
              <div>
                <span>
                  {resultado.accion === "reponer"
                    ? "Conviene pedir"
                    : "Stock suficiente"}
                </span>
                <strong>{resultado.reposicion_sugerida} u.</strong>
                <small>
                  Cubre {resultado.cobertura_semanas}{" "}
                  {resultado.cobertura_semanas === 1 ? "semana" : "semanas"} más
                  el stock de seguridad
                </small>
              </div>
              <p>
                Modelo {resultado.modelo} · error medio de ±
                {resultado.mae_prueba} unidades por semana. Es una sugerencia:
                la decisión de compra es tuya.
              </p>
            </section>
          ) : null}

          <div className="modulo-operativo__acciones modulo-operativo__acciones--dialogo modulo-operativo__ancho-completo">
            <button
              className="modulo-operativo__boton-secundario"
              disabled={cargando}
              onClick={() => setAbierto(false)}
              type="button"
            >
              Cerrar
            </button>
            <button
              className="boton-principal"
              disabled={cargando || !formulario}
              type="submit"
            >
              {cargando ? "Consultando…" : "Calcular sugerencia"}
            </button>
          </div>
        </form>
      </DialogoModal>
    </>
  );
}
