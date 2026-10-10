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
    const resumenVentas = herramientas.find(
      (herramienta) => herramienta.name === "resumen_ventas",
    );
    if (
      !resumenVentas?.description.includes(
        "No sumes importes de monedas distintas.",
      )
    ) {
      throw new Error("Debe separar los importes de monedas distintas.");
    }
  },
);

Deno.test(
  "el asistente puede responder cuántos productos tiene el catálogo sin pedir un nombre",
  async () => {
    let nombreRpc = "";
    const resultado = await despacharHerramienta(
      {
        async rpc(nombre) {
          nombreRpc = nombre;
          return {
            data: {
              productos_activos: 12,
              productos_con_stock_bajo: 2,
              productos_agotados: 1,
              combinaciones_activas: 24,
              detalle_reposicion: [
                {
                  producto: "Polo M",
                  sku: "PLO-M",
                  existencias: 1,
                  stock_minimo: 3,
                },
              ],
            },
            error: null,
          };
        },
      },
      "resumen_catalogo",
      "{}",
    );

    if (!nombresHerramientas.includes("resumen_catalogo" as never)) {
      throw new Error("Debe ofrecer un resumen general del catálogo.");
    }
    if (nombreRpc !== "asistente_resumen_catalogo") {
      throw new Error("Debe consultar el resumen seguro del catálogo.");
    }
    if (
      !resultado ||
      typeof resultado !== "object" ||
      (resultado as { productos_activos: number }).productos_activos !== 12 ||
      !Array.isArray(
        (resultado as { detalle_reposicion: unknown }).detalle_reposicion,
      )
    ) {
      throw new Error("Debe devolver el conteo real de productos activos.");
    }
  },
);

Deno.test(
  "el proveedor recibe instrucciones para consultas directas y borradores guiados",
  async () => {
    let instrucciones = "";
    const fetcher: typeof fetch = async (_url, init) => {
      const cuerpo = JSON.parse(String(init?.body)) as {
        instructions: string;
      };
      instrucciones = cuerpo.instructions;
      return Response.json({ id: "response-id", output: [] });
    };

    await crearRespuesta(
      [{ role: "user", content: "¿Cuántos productos tenemos?" }],
      { apiKey: "clave-prueba", model: "modelo-prueba", fetcher },
      herramientas,
    );

    if (
      !instrucciones
        .toLowerCase()
        .includes("nunca pidas nombre ni sku para contar")
    ) {
      throw new Error("Debe saber responder conteos generales del catálogo.");
    }
    if (!instrucciones.includes("pregunta solo por el dato que falta")) {
      throw new Error("Debe guiar la preparación de una venta.");
    }
    if (!instrucciones.includes("No uses Markdown")) {
      throw new Error(
        "Debe evitar marcas de formato que el chat no interprete.",
      );
    }
    if (!instrucciones.includes("tecnología interna")) {
      throw new Error("Debe limitarse a la operación del negocio.");
    }
  },
);

Deno.test(
  "el asistente consulta con herramientas los módulos de negocio",
  async () => {
    let nombreRpc = "";
    let argumentosRpc: Record<string, unknown> | undefined;
    const modulo = herramientas.find(
      (herramienta) => herramienta.name === "consultar_modulo",
    );

    await despacharHerramienta(
      {
        async rpc(nombre, argumentos) {
          nombreRpc = nombre;
          argumentosRpc = argumentos;
          return { data: { productos: [{ nombre: "Polo" }] }, error: null };
        },
      },
      "consultar_modulo",
      JSON.stringify({
        modulo: "productos",
        busqueda: null,
        desde: null,
        hasta: null,
      }),
    );

    if (!modulo) throw new Error("Debe ofrecer consultas por módulo.");
    if (nombreRpc !== "asistente_consultar_modulo") {
      throw new Error("Debe consultar el RPC de lectura del módulo.");
    }
    if (argumentosRpc?.modulo !== "productos") {
      throw new Error("Debe conservar el módulo solicitado.");
    }
  },
);

Deno.test(
  "el vendedor no consulta empresa ni usuarios desde el asistente",
  async () => {
    let consulto = false;
    const cliente = {
      async rpc() {
        consulto = true;
        return { data: {}, error: null };
      },
    };

    for (const modulo of ["empresa", "usuarios"]) {
      try {
        await despacharHerramienta(
          cliente,
          "consultar_modulo",
          JSON.stringify({
            modulo,
            busqueda: null,
            desde: null,
            hasta: null,
          }),
          "vendedor",
        );
        throw new Error("La consulta protegida se aceptó.");
      } catch (error) {
        if (!(error instanceof ErrorHttp) || error.estado !== 403) throw error;
      }
    }

    if (consulto) throw new Error("No debe consultar el RPC para un vendedor.");
  },
);

Deno.test("la ayuda cubre los módulos de administración", async () => {
  const resultado = await despacharHerramienta(
    {
      async rpc() {
        throw new Error("La ayuda no debe consultar ni modificar datos.");
      },
    },
    "explicar_pantalla",
    '{"pantalla":"usuarios"}',
  );

  if (
    !resultado ||
    typeof resultado !== "object" ||
    !(resultado as { ayuda: string }).ayuda.includes("invitar vendedores")
  ) {
    throw new Error("Debe explicar cómo se administra el acceso del equipo.");
  }
});

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
  "rechaza preparar una venta sin cliente y no llama a la base de datos",
  async () => {
    let rpcInvocado = false;
    try {
      await despacharHerramienta(
        {
          async rpc() {
            rpcInvocado = true;
            return { data: "venta-id", error: null };
          },
        },
        "armar_borrador_venta",
        JSON.stringify({
          venta_id: null,
          cliente_id: null,
          lineas: [
            { producto_id: "producto-id", combinacion_id: null, cantidad: 1 },
          ],
        }),
      );
      throw new Error("Se aceptó una venta sin cliente.");
    } catch (error) {
      if (!(error instanceof ErrorHttp) || error.estado !== 400) throw error;
    }
    if (rpcInvocado) throw new Error("No debe crear el borrador sin cliente.");
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
        cliente_id: "cliente-id",
        tipo_comprobante: "boleta",
        lineas: [
          { producto_id: "producto-id", combinacion_id: null, cantidad: 2 },
        ],
      }),
    );
    if (nombreRpc !== "crear_borrador_venta_con_comprobante")
      throw new Error("La propuesta debe usar la RPC de borrador.");
    if (argumentosRpc?.tipo_comprobante_solicitado !== "boleta")
      throw new Error("La propuesta debe enviar el comprobante elegido.");
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
