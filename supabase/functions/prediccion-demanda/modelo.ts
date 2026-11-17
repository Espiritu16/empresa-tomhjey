/**
 * Predicción de demanda semanal por SKU (APF3).
 *
 * Reproduce el modelo lineal entrenado en `ml/APF3_TD_Grupo1_ML_Innovacion.ipynb`:
 * codificación one-hot + escalado estándar + `intercepto + Σ peso × variable`.
 * Los parámetros vienen de `modelo.json`, que exporta el notebook. La construcción
 * de variables replica `ml/predecir.py`; el test de paridad compara ambos.
 */

export type Producto = {
  nombre: string;
  precio_lista: number;
  prenda: string;
  modelo: string;
  segmento: string;
  tallas: string[];
  fecha_lanzamiento: string;
  tiempo_entrega_semanas: number;
};

export type ParametrosModelo = {
  nombre_modelo: string;
  categoricas: { variable: string; categorias: string[] }[];
  numericas: { variable: string; media: number; escala: number }[];
  pesos: number[];
  intercepto: number;
  catalogo: Record<string, Producto>;
  metricas_prueba: Record<string, number>;
  entrenado_hasta: string;
};

export type RegistroDemanda = {
  producto_id: string;
  talla: string;
  semana: string;
  precio_lista: number;
  descuento?: number;
  ventas_ultimas_4_semanas: number[];
  hubo_quiebre_semana_anterior?: boolean;
  stock_actual: number;
  tiempo_entrega_semanas?: number;
  stock_seguridad?: number;
};

export type ResultadoDemanda = {
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

export class ErrorValidacion extends Error {}

const DIA_MS = 86_400_000;

function fechaUtc(texto: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw new ErrorValidacion("semana debe tener el formato AAAA-MM-DD.");
  }
  const fecha = new Date(`${texto}T00:00:00Z`);
  if (
    Number.isNaN(fecha.getTime()) ||
    fecha.toISOString().slice(0, 10) !== texto
  ) {
    throw new ErrorValidacion("semana no es una fecha válida.");
  }
  return fecha;
}

function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * DIA_MS);
}

/** Semana ISO 8601 (igual que `date.isocalendar().week` en Python). */
export function semanaIso(fecha: Date): number {
  const jueves = sumarDias(fecha, 3 - ((fecha.getUTCDay() + 6) % 7));
  const inicioAnio = Date.UTC(jueves.getUTCFullYear(), 0, 1);
  return 1 + Math.floor((jueves.getTime() - inicioAnio) / DIA_MS / 7);
}

export function temporada(mes: number): string {
  if ([12, 1, 2, 3].includes(mes)) return "Verano";
  if ([4, 5].includes(mes)) return "Otoño";
  if ([6, 7, 8, 9].includes(mes)) return "Invierno";
  return "Primavera";
}

/** Fechas comerciales de Lima, con las mismas reglas usadas al construir el dataset. */
export function eventoSemana(
  lunes: Date,
  prenda: string,
  segmento: string,
): string {
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const contiene = (mes: number, d1: number, d2: number) =>
    dias.some(
      (d) =>
        d.getUTCMonth() + 1 === mes &&
        d.getUTCDate() >= d1 &&
        d.getUTCDate() <= d2,
    );

  const anio = lunes.getUTCFullYear();
  const domingosJunio = Array.from(
    { length: 30 },
    (_, i) => new Date(Date.UTC(anio, 5, i + 1)),
  ).filter((d) => d.getUTCDay() === 0);
  const diaPadre = domingosJunio[2];

  if (contiene(12, 14, 24)) return "Navidad";
  if (contiene(12, 8, 13)) return "Pre-Navidad";
  if (contiene(7, 20, 28)) return "Fiestas Patrias / gratificación";
  if (
    sumarDias(diaPadre, -6) <= lunes &&
    lunes <= diaPadre &&
    prenda === "Pantalón" &&
    segmento === "Adulto"
  ) {
    return "Día del Padre";
  }
  if ((contiene(2, 15, 29) || contiene(3, 1, 10)) && segmento === "Niño")
    return "Campaña escolar";
  if (contiene(12, 26, 31) || contiene(1, 1, 3)) return "Año Nuevo";
  return "Ninguno";
}

function numero(valor: unknown, campo: string): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) {
    throw new ErrorValidacion(`${campo} debe ser un número.`);
  }
  return valor;
}

/** Valida el JSON del MVP y devuelve las variables que espera el modelo. */
export function construirVariables(
  entrada: Record<string, unknown>,
  parametros: ParametrosModelo,
): { variables: Record<string, string | number>; registro: RegistroDemanda } {
  const obligatorios = [
    "producto_id",
    "talla",
    "semana",
    "precio_lista",
    "ventas_ultimas_4_semanas",
    "stock_actual",
  ];
  const faltantes = obligatorios.filter(
    (campo) => entrada[campo] === undefined || entrada[campo] === null,
  );
  if (faltantes.length) {
    throw new ErrorValidacion(
      `Faltan campos obligatorios: ${faltantes.join(", ")}`,
    );
  }

  const productoId = String(entrada.producto_id);
  const producto = parametros.catalogo[productoId];
  if (!producto)
    throw new ErrorValidacion(`Producto desconocido: ${productoId}`);
  const talla = String(entrada.talla);
  if (!producto.tallas.includes(talla)) {
    throw new ErrorValidacion(`La talla ${talla} no existe para ${productoId}`);
  }

  const semana = String(entrada.semana);
  const lunes = fechaUtc(semana);
  if (lunes.getUTCDay() !== 1) {
    throw new ErrorValidacion(
      "semana debe ser la fecha del lunes que inicia la semana",
    );
  }

  const historialBruto = entrada.ventas_ultimas_4_semanas;
  if (!Array.isArray(historialBruto) || historialBruto.length !== 4) {
    throw new ErrorValidacion(
      "ventas_ultimas_4_semanas necesita 4 valores, del más antiguo al más reciente",
    );
  }
  const historial = historialBruto.map((valor, i) =>
    numero(valor, `ventas_ultimas_4_semanas[${i}]`),
  );
  if (historial.some((valor) => valor < 0)) {
    throw new ErrorValidacion(
      "ventas_ultimas_4_semanas no admite valores negativos",
    );
  }

  const precioLista = numero(entrada.precio_lista, "precio_lista");
  const descuento =
    entrada.descuento === undefined
      ? 0
      : numero(entrada.descuento, "descuento");
  if (precioLista <= 0 || descuento < 0 || descuento > 0.5) {
    throw new ErrorValidacion(
      "precio_lista debe ser > 0 y descuento estar entre 0 y 0.5",
    );
  }
  const stockActual = numero(entrada.stock_actual, "stock_actual");
  const stockSeguridad =
    entrada.stock_seguridad === undefined
      ? 0
      : numero(entrada.stock_seguridad, "stock_seguridad");
  if (stockActual < 0 || stockSeguridad < 0) {
    throw new ErrorValidacion(
      "stock_actual y stock_seguridad no pueden ser negativos",
    );
  }
  const tiempoEntrega = Math.trunc(
    entrada.tiempo_entrega_semanas === undefined
      ? producto.tiempo_entrega_semanas
      : numero(entrada.tiempo_entrega_semanas, "tiempo_entrega_semanas"),
  );
  if (tiempoEntrega < 0 || tiempoEntrega > 52) {
    throw new ErrorValidacion("tiempo_entrega_semanas debe estar entre 0 y 52");
  }

  const iso = semanaIso(lunes);
  const evento = eventoSemana(lunes, producto.prenda, producto.segmento);
  const lanzamiento = fechaUtc(producto.fecha_lanzamiento);
  const semanasDesdeLanzamiento = Math.max(
    0,
    Math.floor((lunes.getTime() - lanzamiento.getTime()) / DIA_MS / 7),
  );

  const variables: Record<string, string | number> = {
    producto_id: productoId,
    talla,
    prenda: producto.prenda,
    modelo: producto.modelo,
    segmento: producto.segmento,
    temporada: temporada(lunes.getUTCMonth() + 1),
    evento,
    venta_lag1: historial[3],
    venta_lag2: historial[2],
    venta_lag4: historial[0],
    media_4: (historial[0] + historial[1] + historial[2] + historial[3]) / 4,
    quiebre_lag1: entrada.hubo_quiebre_semana_anterior === true ? 1 : 0,
    precio_unitario: Math.round(precioLista * (1 - descuento) * 100) / 100,
    descuento,
    en_promocion: descuento > 0 ? 1 : 0,
    es_evento: evento !== "Ninguno" ? 1 : 0,
    semanas_desde_lanzamiento: semanasDesdeLanzamiento,
    semana_sen: Math.sin((2 * Math.PI * iso) / 52),
    semana_cos: Math.cos((2 * Math.PI * iso) / 52),
    tiempo_de_entrega: tiempoEntrega,
  };

  return {
    variables,
    registro: {
      producto_id: productoId,
      talla,
      semana,
      precio_lista: precioLista,
      descuento,
      ventas_ultimas_4_semanas: historial,
      hubo_quiebre_semana_anterior:
        entrada.hubo_quiebre_semana_anterior === true,
      stock_actual: stockActual,
      tiempo_entrega_semanas: tiempoEntrega,
      stock_seguridad: stockSeguridad,
    },
  };
}

/** Aplica one-hot + escalado + combinación lineal, como el Pipeline de scikit-learn. */
export function estimarUnidades(
  variables: Record<string, string | number>,
  parametros: ParametrosModelo,
): number {
  const vector: number[] = [];
  for (const { variable, categorias } of parametros.categoricas) {
    const valor = String(variables[variable]);
    for (const categoria of categorias)
      vector.push(valor === categoria ? 1 : 0);
  }
  for (const { variable, media, escala } of parametros.numericas) {
    vector.push((Number(variables[variable]) - media) / escala);
  }
  if (vector.length !== parametros.pesos.length) {
    throw new Error(
      "Los parámetros del modelo no coinciden con las variables.",
    );
  }
  let total = parametros.intercepto;
  for (let i = 0; i < vector.length; i++)
    total += vector[i] * parametros.pesos[i];
  return Math.max(0, total);
}

/** Catálogo que conoce el modelo, para que el MVP ofrezca solo productos y tallas válidos. */
export function catalogoModelo(parametros: ParametrosModelo) {
  return {
    modelo: parametros.nombre_modelo,
    entrenado_hasta: parametros.entrenado_hasta,
    mae_prueba: parametros.metricas_prueba.MAE,
    productos: Object.entries(parametros.catalogo).map(
      ([productoId, producto]) => ({
        producto_id: productoId,
        nombre: producto.nombre,
        tallas: producto.tallas,
        precio_lista: producto.precio_lista,
        tiempo_entrega_semanas: producto.tiempo_entrega_semanas,
      }),
    ),
  };
}

export function predecirDemanda(
  entrada: Record<string, unknown>,
  parametros: ParametrosModelo,
): ResultadoDemanda {
  const { variables, registro } = construirVariables(entrada, parametros);
  const estimadas = estimarUnidades(variables, parametros);
  const cobertura = (registro.tiempo_entrega_semanas ?? 0) + 1;
  // Cubrir la semana actual más las semanas que tarda en llegar el pedido.
  const necesidad = estimadas * cobertura + (registro.stock_seguridad ?? 0);
  const reponer = Math.max(0, Math.ceil(necesidad - registro.stock_actual));

  return {
    sku: `${registro.producto_id}-${registro.talla}`,
    semana: registro.semana,
    evento: String(variables.evento),
    unidades_estimadas: Math.round(estimadas * 100) / 100,
    unidades_estimadas_redondeadas: Math.round(estimadas),
    cobertura_semanas: cobertura,
    reposicion_sugerida: reponer,
    accion: reponer > 0 ? "reponer" : "stock suficiente",
    modelo: parametros.nombre_modelo,
    mae_prueba: parametros.metricas_prueba.MAE,
  };
}
