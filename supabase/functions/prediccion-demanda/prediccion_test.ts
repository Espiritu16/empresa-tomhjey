/// <reference lib="deno.ns" />

import {
  leerPaginado,
  lunesActualLima,
  precioParaModelo,
  semanasPrevias,
  ventasPorSemana,
} from "./datos-mvp.ts";
import parametros from "./modelo.json" with { type: "json" };
import casos from "./paridad_prueba.json" with { type: "json" };
import {
  catalogoModelo,
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

Deno.test(
  "el catálogo expone los 18 productos con nombre, tallas y precio",
  () => {
    const catalogo = catalogoModelo(modelo);
    if (catalogo.productos.length !== 18)
      throw new Error("Deben ser 18 productos.");
    const short = catalogo.productos.find((p) => p.producto_id === "S02");
    if (
      !short ||
      short.nombre !== "Short jean" ||
      !short.tallas.includes("30") ||
      short.precio_lista !== 33
    ) {
      throw new Error("El catálogo no trae los datos del Short jean.");
    }
    if (catalogo.modelo !== modelo.nombre_modelo)
      throw new Error("Debe informar el modelo.");
  },
);

Deno.test("toma el lunes de la semana en hora de Lima", () => {
  // Lunes 16-11-2026 a las 02:00 UTC todavía es domingo 15 en Lima.
  if (lunesActualLima(new Date("2026-11-16T02:00:00Z")) !== "2026-11-09") {
    throw new Error(
      "Antes de medianoche en Lima sigue siendo la semana anterior.",
    );
  }
  if (lunesActualLima(new Date("2026-11-16T06:00:00Z")) !== "2026-11-16") {
    throw new Error("El lunes en Lima empieza una semana nueva.");
  }
  if (lunesActualLima(new Date("2026-11-21T15:00:00Z")) !== "2026-11-16") {
    throw new Error("El sábado pertenece a la semana del lunes 16.");
  }
});

Deno.test("suma las ventas confirmadas por semana de lunes a domingo", () => {
  const semanas = semanasPrevias("2026-11-16").map((d) => d.toISOString());
  if (
    semanas[0] !== "2026-10-19T05:00:00.000Z" ||
    semanas[3] !== "2026-11-09T05:00:00.000Z"
  ) {
    throw new Error("Las 4 semanas previas deben empezar a las 00:00 de Lima.");
  }
  const ventas = ventasPorSemana(
    [
      { cantidad: 2, confirmado_en: "2026-10-19T05:00:00Z" }, // inicio semana 1
      { cantidad: 1, confirmado_en: "2026-10-26T04:59:59Z" }, // domingo 25 en Lima: semana 1
      { cantidad: 3, confirmado_en: "2026-11-02T15:00:00Z" }, // semana 3
      { cantidad: 4, confirmado_en: "2026-11-15T20:00:00Z" }, // domingo 15: semana 4
      { cantidad: 9, confirmado_en: "2026-11-16T15:00:00Z" }, // semana actual: no cuenta
      { cantidad: 9, confirmado_en: "2026-10-18T15:00:00Z" }, // antes de la ventana
    ],
    "2026-11-16",
  );
  if (ventas.join(",") !== "3,0,3,4") {
    throw new Error(`Ventas por semana incorrectas: ${ventas.join(",")}`);
  }
});

Deno.test(
  "usa el precio de la ficha solo si es comparable al del catálogo",
  () => {
    if (precioParaModelo(42, 40) !== 42)
      throw new Error("42 frente a 40 es comparable.");
    if (precioParaModelo(89.9, 45) !== 45)
      throw new Error("89.90 frente a 45 debe usar el catálogo.");
    if (precioParaModelo(null, 30) !== 30)
      throw new Error("Sin precio usa el catálogo.");
  },
);

Deno.test("leerPaginado junta todas las páginas de 1000 filas", async () => {
  const total = 2345;
  const pedidos: [number, number][] = [];
  const { data, error } = await leerPaginado<number>((desde, hasta) => {
    pedidos.push([desde, hasta]);
    const fin = Math.min(hasta, total - 1);
    const filas = [];
    for (let i = desde; i <= fin; i++) filas.push(i);
    return Promise.resolve({ data: filas, error: null });
  });
  if (error || data.length !== total || data[total - 1] !== total - 1) {
    throw new Error(`Se esperaban ${total} filas y llegaron ${data.length}`);
  }
  if (pedidos.length !== 3 || pedidos[2][0] !== 2000) {
    throw new Error(`Páginas inesperadas: ${JSON.stringify(pedidos)}`);
  }
});
