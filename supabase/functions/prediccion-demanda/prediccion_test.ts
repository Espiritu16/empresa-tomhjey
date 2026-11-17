/// <reference lib="deno.ns" />

import parametros from "./modelo.json" with { type: "json" };
import casos from "./paridad_prueba.json" with { type: "json" };
import {
  ErrorValidacion,
  eventoSemana,
  type ParametrosModelo,
  predecirDemanda,
  semanaIso,
} from "./modelo.ts";

const modelo = parametros as ParametrosModelo;

function lanzaValidacion(accion: () => unknown, mensaje: string) {
  try {
    accion();
  } catch (error) {
    if (error instanceof ErrorValidacion) return;
    throw error;
  }
  throw new Error(mensaje);
}

Deno.test(
  "reproduce las predicciones de scikit-learn en todas las filas de prueba",
  () => {
    let maxima = 0;
    for (const caso of casos as {
      registro: Record<string, unknown>;
      esperado: number;
    }[]) {
      const resultado = predecirDemanda(caso.registro, modelo);
      const diferencia = Math.abs(
        resultado.unidades_estimadas - Math.round(caso.esperado * 100) / 100,
      );
      maxima = Math.max(maxima, diferencia);
      if (diferencia > 0.011) {
        throw new Error(
          `${resultado.sku} ${resultado.semana}: ${resultado.unidades_estimadas} vs ${caso.esperado}`,
        );
      }
    }
    if ((casos as unknown[]).length < 500)
      throw new Error("El archivo de paridad está incompleto.");
    console.log(
      `Casos: ${(casos as unknown[]).length} · diferencia máxima: ${maxima}`,
    );
  },
);

Deno.test(
  "calcula la reposición con tiempo de entrega y stock de seguridad",
  () => {
    const resultado = predecirDemanda(
      {
        producto_id: "S02",
        talla: "30",
        semana: "2026-11-02",
        precio_lista: 33,
        descuento: 0,
        ventas_ultimas_4_semanas: [0, 4, 1, 6],
        hubo_quiebre_semana_anterior: false,
        stock_actual: 0,
        tiempo_entrega_semanas: 2,
        stock_seguridad: 2,
      },
      modelo,
    );
    const esperado = Math.max(
      0,
      Math.ceil(resultado.unidades_estimadas * 3 + 2 - 0 - 1e-9),
    );
    if (resultado.cobertura_semanas !== 3)
      throw new Error("La cobertura debe ser entrega + 1.");
    if (Math.abs(resultado.reposicion_sugerida - esperado) > 1)
      throw new Error("Reposición incoherente.");
    if (resultado.accion !== "reponer")
      throw new Error("Sin stock debe sugerir reponer.");
  },
);

Deno.test("con stock de sobra sugiere no reponer", () => {
  const resultado = predecirDemanda(
    {
      producto_id: "S02",
      talla: "30",
      semana: "2026-11-02",
      precio_lista: 33,
      ventas_ultimas_4_semanas: [0, 1, 0, 1],
      stock_actual: 500,
    },
    modelo,
  );
  if (
    resultado.reposicion_sugerida !== 0 ||
    resultado.accion !== "stock suficiente"
  ) {
    throw new Error("Con 500 unidades no debe sugerir reponer.");
  }
});

Deno.test("rechaza entradas inválidas con mensajes claros", () => {
  const base = {
    producto_id: "S02",
    talla: "30",
    semana: "2026-11-02",
    precio_lista: 33,
    ventas_ultimas_4_semanas: [0, 4, 1, 6],
    stock_actual: 0,
  };
  lanzaValidacion(
    () => predecirDemanda({ ...base, talla: "99" }, modelo),
    "talla inexistente",
  );
  lanzaValidacion(
    () => predecirDemanda({ ...base, producto_id: "X99" }, modelo),
    "producto inexistente",
  );
  lanzaValidacion(
    () => predecirDemanda({ ...base, semana: "2026-11-03" }, modelo),
    "semana que no es lunes",
  );
  lanzaValidacion(
    () =>
      predecirDemanda({ ...base, ventas_ultimas_4_semanas: [1, 2] }, modelo),
    "historial corto",
  );
  lanzaValidacion(
    () => predecirDemanda({ ...base, descuento: 0.9 }, modelo),
    "descuento fuera de rango",
  );
  lanzaValidacion(
    () => predecirDemanda({ ...base, stock_actual: undefined }, modelo),
    "falta stock",
  );
});

Deno.test("calendario: semana ISO y fechas comerciales", () => {
  const fecha = (texto: string) => new Date(`${texto}T00:00:00Z`);
  if (semanaIso(fecha("2025-12-29")) !== 1)
    throw new Error("29-12-2025 es semana ISO 1.");
  if (semanaIso(fecha("2026-11-02")) !== 45)
    throw new Error("02-11-2026 es semana ISO 45.");
  if (eventoSemana(fecha("2026-12-14"), "Short", "Adulto") !== "Navidad")
    throw new Error("Navidad");
  if (
    eventoSemana(fecha("2026-06-15"), "Pantalón", "Adulto") !== "Día del Padre"
  )
    throw new Error("Día del Padre");
  if (eventoSemana(fecha("2026-06-15"), "Short", "Adulto") !== "Ninguno")
    throw new Error("Día del Padre solo pantalón adulto");
});
