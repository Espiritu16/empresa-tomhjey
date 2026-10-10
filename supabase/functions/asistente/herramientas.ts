import { ErrorHttp } from "../_shared/http.ts";

export type NombreHerramienta =
  | "buscar_producto"
  | "consultar_stock"
  | "resumen_catalogo"
  | "consultar_modulo"
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
    name: "resumen_catalogo",
    description:
      "Devuelve conteos de productos y el detalle de productos que requieren reposición. La herramienta consultar_modulo ofrece los nombres y combinaciones del catálogo para preguntas generales o de seguimiento.",
    strict: true,
    parameters: objetoEstricto({}, []),
  },
  {
    type: "function",
    name: "consultar_modulo",
    description:
      "Consulta datos operativos permitidos de un módulo: inicio, productos, inventario, clientes, ventas, facturación, reportes, empresa o usuarios. Filtra por nombre o serie cuando se indique; para ventas, facturación y reportes usa el periodo solicitado. Solo lectura; nunca cambia datos.",
    strict: true,
    parameters: objetoEstricto(
      {
        modulo: {
          type: "string",
          enum: [
            "inicio",
            "productos",
            "inventario",
            "clientes",
            "ventas",
            "facturacion",
            "reportes",
            "empresa",
            "usuarios",
          ],
        },
        busqueda: { type: ["string", "null"], maxLength: 120 },
        desde: { type: ["string", "null"], format: "date-time" },
        hasta: { type: ["string", "null"], format: "date-time" },
      },
      ["modulo", "busqueda", "desde", "hasta"],
    ),
  },
  {
    type: "function",
    name: "resumen_ventas",
    description:
      "Resume cantidad e importes por moneda de las ventas confirmadas visibles para la persona en el periodo solicitado. No sumes importes de monedas distintas. El inicio se incluye y el fin se excluye.",
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
            "reportes",
            "empresa",
            "usuarios",
            "asistente",
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
      "Crea o actualiza un borrador solo cuando ya se identificaron un cliente activo, los productos, sus combinaciones, cantidades y el tipo de comprobante factura o boleta. El cliente y el tipo son obligatorios. No recibe precios. Nunca confirma la venta ni descuenta existencias.",
    strict: true,
    parameters: objetoEstricto(
      {
        venta_id: { type: ["string", "null"] },
        cliente_id: { type: "string", minLength: 1 },
        tipo_comprobante: { type: "string", enum: ["factura", "boleta"] },
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
      ["venta_id", "cliente_id", "tipo_comprobante", "lineas"],
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
    resumen_catalogo: [],
    consultar_modulo: ["modulo", "busqueda", "desde", "hasta"],
    resumen_ventas: ["desde", "hasta"],
    explicar_pantalla: ["pantalla"],
    armar_borrador_venta: [
      "venta_id",
      "cliente_id",
      "tipo_comprobante",
      "lineas",
    ],
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
    "Inicio resume las ventas recientes y señala productos que requieren reposición. Los importes se muestran según los permisos de tu rol.",
  productos:
    "Productos permite consultar el catálogo y sus combinaciones. La administración puede crear, editar e inactivar productos; el rol vendedor consulta el catálogo para atender ventas.",
  inventario:
    "Inventario muestra existencias y el historial de movimientos. Un ajuste de stock requiere permiso de administración y un motivo; cada ajuste queda registrado.",
  clientes:
    "Clientes conserva los datos necesarios para registrar ventas y emitir comprobantes, permite consultar su historial y mantener sus registros activos.",
  ventas:
    "Ventas permite crear, editar y descartar borradores asociados a un cliente. Al confirmar, el servidor valida precios y existencias y registra el movimiento de stock. La asistencia puede preparar el borrador; la persona lo revisa y lo confirma desde su tarjeta en el chat o en Ventas.",
  facturacion:
    "Facturación emite facturas o boletas de ventas confirmadas y muestra el estado devuelto por NubeFacT. La emisión requiere los datos fiscales de la empresa y una serie activa.",
  reportes:
    "Reportes permite elegir un periodo y consultar ventas confirmadas, importes, productos vendidos y productos que requieren reposición.",
  empresa:
    "Empresa y configuración guarda los datos comerciales y fiscales que se usan en ventas y comprobantes, como el nombre, RUC, dirección, moneda e IGV.",
  usuarios:
    "Usuarios permite a la administración invitar vendedores y activar o pausar sus accesos. El MVP tiene dos roles: administrador y vendedor.",
  asistente:
    "El asistente consulta información de los módulos según tu rol: productos, existencias, clientes, ventas, facturación, reportes, empresa y equipo. Puede preparar un borrador de venta con cliente obligatorio; la persona revisa la tarjeta y confirma manualmente. No cambia la configuración ni confirma operaciones por su cuenta.",
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
  rol: "administrador" | "vendedor" = "administrador",
) {
  const argumentos = analizarArgumentos(nombre, argumentosCrudos);
  switch (nombre as NombreHerramienta) {
    case "resumen_catalogo": {
      const { data, error } = await cliente.rpc("asistente_resumen_catalogo");
      if (error)
        throw new ErrorHttp(
          "No se pudo calcular el resumen del catálogo.",
          500,
          "consulta_fallida",
        );
      return data;
    }
    case "consultar_modulo": {
      const modulo = argumentos.modulo;
      const busqueda = argumentos.busqueda;
      const desde = argumentos.desde;
      const hasta = argumentos.hasta;
      const modulos = [
        "inicio",
        "productos",
        "inventario",
        "clientes",
        "ventas",
        "facturacion",
        "reportes",
        "empresa",
        "usuarios",
      ];
      if (
        typeof modulo !== "string" ||
        !modulos.includes(modulo) ||
        !(typeof busqueda === "string" || busqueda === null) ||
        (typeof busqueda === "string" && busqueda.length > 120) ||
        !(typeof desde === "string" || desde === null) ||
        !(typeof hasta === "string" || hasta === null)
      ) {
        throw new ErrorHttp(
          "La consulta del módulo no tiene datos válidos.",
          400,
          "argumentos_invalidos",
        );
      }
      if (
        (desde !== null && Number.isNaN(Date.parse(desde))) ||
        (hasta !== null && Number.isNaN(Date.parse(hasta))) ||
        (desde !== null &&
          hasta !== null &&
          Date.parse(desde) >= Date.parse(hasta))
      ) {
        throw new ErrorHttp(
          "El periodo de consulta no es válido.",
          400,
          "periodo_invalido",
        );
      }
      if (
        (modulo === "empresa" || modulo === "usuarios") &&
        rol !== "administrador"
      ) {
        throw new ErrorHttp(
          "Esta información solo está disponible para administración.",
          403,
          "rol_requerido",
        );
      }
      const { data, error } = await cliente.rpc("asistente_consultar_modulo", {
        modulo,
        busqueda: typeof busqueda === "string" ? busqueda.trim() || null : null,
        desde,
        hasta,
      });
      if (error)
        throw new ErrorHttp(
          "No se pudo consultar ese módulo.",
          500,
          "consulta_fallida",
        );
      return data;
    }
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
      const tipoComprobante = argumentos.tipo_comprobante;
      if (
        !(typeof ventaId === "string" || ventaId === null) ||
        typeof clienteId !== "string" ||
        !clienteId.trim() ||
        (tipoComprobante !== "factura" && tipoComprobante !== "boleta")
      ) {
        throw new ErrorHttp(
          "Se requiere un cliente activo y elegir factura o boleta antes de preparar la venta.",
          400,
          "argumentos_invalidos",
        );
      }
      const { data, error } = await cliente.rpc(
        "crear_borrador_venta_con_comprobante",
        {
          cliente_objetivo: clienteId,
          lineas,
          tipo_comprobante_solicitado: tipoComprobante,
          venta_objetivo: ventaId,
        },
      );
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
