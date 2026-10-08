import { ErrorHttp } from "../_shared/http.ts";

export type NombreHerramienta =
  | "buscar_producto"
  | "consultar_stock"
  | "resumen_ventas"
  | "explicar_pantalla"
  | "armar_borrador_venta";

export type DefinicionHerramienta = {
  type: "function";
  name: NombreHerramienta;
  description: string;
  strict: true;
  parameters: Record<string, unknown>;
};

const objetoEstricto = (
  properties: Record<string, unknown>,
  required: string[],
) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const herramientas: DefinicionHerramienta[] = [
  {
    type: "function",
    name: "buscar_producto",
    description:
      "Busca productos o combinaciones por nombre o SKU y devuelve precios y existencias actuales.",
    strict: true,
    parameters: objetoEstricto(
      { texto: { type: "string", minLength: 1, maxLength: 120 } },
      ["texto"],
    ),
  },
  {
    type: "function",
    name: "consultar_stock",
    description: "Consulta las existencias actuales por nombre o SKU.",
    strict: true,
    parameters: objetoEstricto(
      { texto: { type: "string", minLength: 1, maxLength: 120 } },
      ["texto"],
    ),
  },
  {
    type: "function",
    name: "resumen_ventas",
    description:
      "Resume las ventas confirmadas visibles para la persona en un periodo ISO.",
    strict: true,
    parameters: objetoEstricto(
      {
        desde: { type: "string", format: "date-time" },
        hasta: { type: "string", format: "date-time" },
      },
      ["desde", "hasta"],
    ),
  },
  {
    type: "function",
    name: "explicar_pantalla",
    description:
      "Explica una pantalla usando ayuda aprobada; no inventes funciones que no estén descritas.",
    strict: true,
    parameters: objetoEstricto(
      {
        pantalla: {
          type: "string",
          enum: [
            "inicio",
            "productos",
            "inventario",
            "clientes",
            "ventas",
            "facturacion",
          ],
        },
      },
      ["pantalla"],
    ),
  },
  {
    type: "function",
    name: "armar_borrador_venta",
    description:
      "Crea o actualiza un borrador. Nunca confirma la venta ni descuenta existencias.",
    strict: true,
    parameters: objetoEstricto(
      {
        venta_id: { type: ["string", "null"] },
        cliente_id: { type: ["string", "null"] },
        lineas: {
          type: "array",
          minItems: 1,
          maxItems: 30,
          items: {
            type: "object",
            properties: {
              producto_id: { type: "string" },
              combinacion_id: { type: ["string", "null"] },
              cantidad: { type: "number", exclusiveMinimum: 0 },
            },
            required: ["producto_id", "combinacion_id", "cantidad"],
            additionalProperties: false,
          },
        },
      },
      ["venta_id", "cliente_id", "lineas"],
    ),
  },
];

export const nombresHerramientas = herramientas.map(
  (herramienta) => herramienta.name,
);

export function analizarArgumentos(
  nombre: string,
  entrada: string,
): Record<string, unknown> {
  if (!nombresHerramientas.includes(nombre as NombreHerramienta)) {
    throw new ErrorHttp(
      "El asistente solicitó una herramienta no autorizada.",
      400,
      "herramienta_no_permitida",
    );
  }
  let valor: unknown;
  try {
    valor = JSON.parse(entrada);
  } catch {
    throw new ErrorHttp(
      "Los argumentos de la herramienta no son JSON válido.",
      400,
      "argumentos_invalidos",
    );
  }
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    throw new ErrorHttp(
      "Los argumentos de la herramienta deben ser un objeto.",
      400,
      "argumentos_invalidos",
    );
  }
  const argumentos = valor as Record<string, unknown>;
  const permitidos: Record<NombreHerramienta, string[]> = {
    buscar_producto: ["texto"],
    consultar_stock: ["texto"],
    resumen_ventas: ["desde", "hasta"],
    explicar_pantalla: ["pantalla"],
    armar_borrador_venta: ["venta_id", "cliente_id", "lineas"],
  };
  if (
    Object.keys(argumentos).some(
      (campo) => !permitidos[nombre as NombreHerramienta].includes(campo),
    )
  ) {
    throw new ErrorHttp(
      "Los argumentos incluyen campos no autorizados.",
      400,
      "argumentos_invalidos",
    );
  }
  if ("empresa_id" in argumentos || "company_id" in argumentos) {
    throw new ErrorHttp(
      "La herramienta no puede elegir una empresa.",
      400,
      "argumentos_invalidos",
    );
  }
  return argumentos;
}

const ayuda: Record<string, string> = {
  inicio:
    "Inicio resume la actividad reciente y señala productos con existencias bajas.",
  productos:
    "Productos permite consultar el catálogo y, solo con rol administrador, crear o actualizar productos y combinaciones.",
  inventario:
    "Inventario muestra existencias y movimientos. Los ajustes requieren administrador y un motivo.",
  clientes:
    "Clientes conserva los datos de contacto y permite revisar las ventas asociadas.",
  ventas:
    "Ventas permite crear un borrador y confirmarlo. Al confirmar, el servidor valida precios y existencias.",
  facturacion:
    "Facturación emite boletas o facturas de ventas confirmadas y muestra el estado devuelto por NubeFacT.",
};

export async function despacharHerramienta(
  cliente: {
    rpc: (
      nombre: string,
      argumentos?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  },
  nombre: string,
  argumentosCrudos: string,
) {
  const argumentos = analizarArgumentos(nombre, argumentosCrudos);
  switch (nombre as NombreHerramienta) {
    case "buscar_producto":
    case "consultar_stock": {
      const texto = argumentos.texto;
      if (typeof texto !== "string" || !texto.trim() || texto.length > 120) {
        throw new ErrorHttp(
          "Indica un texto de búsqueda válido.",
          400,
          "argumentos_invalidos",
        );
      }
      const { data, error } = await cliente.rpc("asistente_buscar_productos", {
        texto_busqueda: texto.trim(),
        max_resultados: 8,
      });
      if (error)
        throw new ErrorHttp(
          "No se pudo buscar en el catálogo.",
          500,
          "consulta_fallida",
        );
      return data ?? [];
    }
    case "resumen_ventas": {
      const desde = argumentos.desde;
      const hasta = argumentos.hasta;
      if (
        typeof desde !== "string" ||
        typeof hasta !== "string" ||
        Number.isNaN(Date.parse(desde)) ||
        Number.isNaN(Date.parse(hasta)) ||
        Date.parse(desde) >= Date.parse(hasta)
      ) {
        throw new ErrorHttp(
          "El periodo de ventas no es válido.",
          400,
          "periodo_invalido",
        );
      }
      const { data, error } = await cliente.rpc("asistente_resumen_ventas", {
        desde,
        hasta,
      });
      if (error)
        throw new ErrorHttp(
          "No se pudo calcular el resumen de ventas.",
          500,
          "consulta_fallida",
        );
      return data;
    }
    case "explicar_pantalla": {
      const pantalla = argumentos.pantalla;
      if (typeof pantalla !== "string" || !ayuda[pantalla]) {
        throw new ErrorHttp(
          "No hay una guía aprobada para esa pantalla.",
          404,
          "ayuda_no_disponible",
        );
      }
      return { pantalla, ayuda: ayuda[pantalla] };
    }
    case "armar_borrador_venta": {
      const lineas = argumentos.lineas;
      if (!Array.isArray(lineas) || lineas.length === 0 || lineas.length > 30) {
        throw new ErrorHttp(
          "La venta debe tener entre 1 y 30 líneas.",
          400,
          "lineas_invalidas",
        );
      }
      for (const linea of lineas) {
        if (!linea || typeof linea !== "object" || Array.isArray(linea)) {
          throw new ErrorHttp(
            "Una línea de venta no tiene el formato esperado.",
            400,
            "lineas_invalidas",
          );
        }
        const valor = linea as Record<string, unknown>;
        if (
          Object.keys(valor).some(
            (campo) =>
              !["producto_id", "combinacion_id", "cantidad"].includes(campo),
          )
        ) {
          throw new ErrorHttp(
            "Una línea contiene campos no autorizados.",
            400,
            "lineas_invalidas",
          );
        }
        if (
          typeof valor.producto_id !== "string" ||
          typeof valor.cantidad !== "number" ||
          !Number.isFinite(valor.cantidad) ||
          valor.cantidad <= 0 ||
          !(
            typeof valor.combinacion_id === "string" ||
            valor.combinacion_id === null
          )
        ) {
          throw new ErrorHttp(
            "Una línea de venta no tiene producto, combinación o cantidad válida.",
            400,
            "lineas_invalidas",
          );
        }
      }
      const ventaId = argumentos.venta_id;
      const clienteId = argumentos.cliente_id;
      if (
        !(typeof ventaId === "string" || ventaId === null) ||
        !(typeof clienteId === "string" || clienteId === null)
      ) {
        throw new ErrorHttp(
          "La venta o el cliente no tienen un identificador válido.",
          400,
          "argumentos_invalidos",
        );
      }
      const { data, error } = await cliente.rpc("crear_borrador_venta", {
        cliente_objetivo: clienteId,
        lineas,
        venta_objetivo: ventaId,
      });
      if (error)
        throw new ErrorHttp(error.message, 422, "borrador_no_guardado");
      return {
        ventaId: data,
        estado: "borrador",
        mensaje:
          "El borrador quedó guardado; aún no se confirmó ni se descontó stock.",
      };
    }
  }
}
