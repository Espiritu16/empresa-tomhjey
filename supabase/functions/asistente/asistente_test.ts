/// <reference lib="deno.ns" />

import { ErrorHttp } from "../_shared/http.ts";
import {
  analizarArgumentos,
  despacharHerramienta,
  herramientas,
  nombresHerramientas,
} from "./herramientas.ts";
import { crearRespuesta, extraerTexto } from "./proveedor.ts";

Deno.test(
  "la allowlist no ofrece herramientas para confirmar ni emitir",
  () => {
    if (nombresHerramientas.includes("confirmar_venta" as never))
      throw new Error("No se debe exponer confirmación.");
    if (nombresHerramientas.includes("emitir_comprobante" as never))
      throw new Error("No se debe exponer emisión.");
    if (
      herramientas.some(
        (herramienta) =>
          !herramienta.strict ||
          herramienta.parameters.additionalProperties !== false,
      )
    ) {
      throw new Error("Cada herramienta debe tener un esquema estricto.");
    }
  },
);

Deno.test(
  "rechaza herramientas desconocidas, JSON inválido y selección de empresa",
  () => {
    const casos = [
      () => analizarArgumentos("confirmar_venta", "{}"),
      () => analizarArgumentos("buscar_producto", "{"),
      () =>
        analizarArgumentos(
          "buscar_producto",
          '{"texto":"jean","empresa_id":"otra"}',
        ),
      () =>
        analizarArgumentos(
          "buscar_producto",
          '{"texto":"jean","rol":"administrador"}',
        ),
    ];
    for (const caso of casos) {
      try {
        caso();
        throw new Error("El argumento inválido fue aceptado.");
      } catch (error) {
        if (!(error instanceof ErrorHttp)) throw error;
      }
    }
  },
);

Deno.test(
  "rechaza campos adicionales dentro de una línea propuesta",
  async () => {
    try {
      await despacharHerramienta(
        {
          async rpc() {
            return { data: null, error: null };
          },
        },
        "armar_borrador_venta",
        '{"venta_id":null,"cliente_id":null,"lineas":[{"producto_id":"p","combinacion_id":null,"cantidad":1,"precio":0}]}',
      );
      throw new Error("El campo precio no autorizado fue aceptado.");
    } catch (error) {
      if (!(error instanceof ErrorHttp)) throw error;
    }
  },
);

Deno.test(
  "la propuesta de venta llama solo al RPC de borrador y no manda precio",
  async () => {
    let nombreRpc = "";
    let argumentosRpc: Record<string, unknown> | undefined;
    const resultado = await despacharHerramienta(
      {
        async rpc(nombre, argumentos) {
          nombreRpc = nombre;
          argumentosRpc = argumentos;
          return { data: "venta-id", error: null };
        },
      },
      "armar_borrador_venta",
      JSON.stringify({
        venta_id: null,
        cliente_id: null,
        lineas: [
          { producto_id: "producto-id", combinacion_id: null, cantidad: 2 },
        ],
      }),
    );
    if (nombreRpc !== "crear_borrador_venta")
      throw new Error("La propuesta debe usar la RPC de borrador.");
    if (!argumentosRpc || "precio" in argumentosRpc)
      throw new Error("El cliente no debe aportar precio.");
    if (
      !resultado ||
      typeof resultado !== "object" ||
      (resultado as { estado: string }).estado !== "borrador"
    ) {
      throw new Error("Debe devolver el borrador sin confirmarlo.");
    }
  },
);

Deno.test(
  "el adaptador Responses usa herramientas y extrae texto del resultado",
  async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        id: "response-id",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Hola, equipo." }],
          },
        ],
      });
    };
    const respuesta = await crearRespuesta(
      [{ role: "user", content: "Hola" }],
      {
        apiKey: "clave-prueba",
        model: "modelo-prueba",
        fetcher,
      },
      herramientas,
    );
    if (extraerTexto(respuesta) !== "Hola, equipo.")
      throw new Error("No extrajo el texto de salida.");
    if (
      requestBody?.model !== "modelo-prueba" ||
      requestBody?.tool_choice !== "auto"
    ) {
      throw new Error("No envió modelo y tool choice.");
    }
  },
);
