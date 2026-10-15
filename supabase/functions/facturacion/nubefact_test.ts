/// <reference lib="deno.ns" />

import {
  crearClienteNubefact,
  emitirReconciliando,
  ErrorNubefact,
  validarConfiguracionEmision,
  type PayloadNubefact,
} from "./nubefact.ts";

const credenciales = {
  ruta: "https://api.nubefact.com/api/v1/uuid-prueba",
  token: "token-prueba",
};

const payload: PayloadNubefact = {
  tipo_de_comprobante: 2,
  serie: "B001",
  numero: 17,
  total: 100,
  fecha_de_emision: "07-10-2026",
  codigo_unico: "comprobante-prueba",
};

const respuestaEmitida = {
  enlace_del_pdf: "https://example.test/comprobante.pdf",
  cadena_para_codigo_qr:
    "20100066603 | 03 | B001 | 17 | 15.25 | 100.00 | 07/10/2026 | 1 | hash",
};

Deno.test(
  "envía comprobantes al endpoint con el encabezado Token documentado",
  async () => {
    let llamada: { url: URL; init: RequestInit } | undefined;
    const fetcher: typeof fetch = async (url, init) => {
      llamada = {
        url: new URL(url instanceof Request ? url.url : String(url)),
        init: init ?? {},
      };
      return Response.json(respuestaEmitida);
    };
    const cliente = crearClienteNubefact(credenciales, fetcher);
    await cliente.emitir(payload);

    if (!llamada) throw new Error("No se llamó a NubeFacT.");
    if (llamada.url.hostname !== "api.nubefact.com")
      throw new Error("La ruta no es la esperada.");
    const headers = new Headers(llamada.init.headers);
    if (headers.get("Authorization") !== 'Token token="token-prueba"') {
      throw new Error("El encabezado de autorización no coincide.");
    }
    const cuerpo = JSON.parse(String(llamada.init.body));
    if (cuerpo.operacion !== "generar_comprobante" || cuerpo.numero !== 17) {
      throw new Error("El cuerpo de emisión no coincide.");
    }
  },
);

Deno.test(
  "reconcilia el código 23 consultando exactamente la serie y el número reservado",
  async () => {
    const cuerpos: Record<string, unknown>[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      const cuerpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
      cuerpos.push(cuerpo);
      if (cuerpos.length === 1)
        return Response.json(
          { errors: "Este documento ya existe", codigo: 23 },
          { status: 400 },
        );
      return Response.json(respuestaEmitida);
    };

    const resultado = await emitirReconciliando(payload, credenciales, fetcher);
    if (
      resultado.cadena_para_codigo_qr !== respuestaEmitida.cadena_para_codigo_qr
    ) {
      throw new Error("La respuesta reconciliada no coincide.");
    }
    if (
      cuerpos.length !== 2 ||
      cuerpos[1].operacion !== "consultar_comprobante"
    ) {
      throw new Error("El segundo llamado debe consultar, no volver a emitir.");
    }
    if (cuerpos[1].serie !== "B001" || cuerpos[1].numero !== 17) {
      throw new Error("La reconciliación debe conservar la reserva.");
    }
  },
);

Deno.test(
  "consulta una factura ya emitida por tipo, serie y número sin llamar a emitir",
  async () => {
    let cuerpo: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_url, init) => {
      cuerpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ aceptada_por_sunat: true });
    };
    const cliente = crearClienteNubefact(credenciales, fetcher);
    await cliente.consultar(1, "F001", 84);

    if (cuerpo?.operacion !== "consultar_comprobante") {
      throw new Error("Debe consultar el estado, sin emitir otra factura.");
    }
    if (
      cuerpo.tipo_de_comprobante !== 1 ||
      cuerpo.serie !== "F001" ||
      cuerpo.numero !== 84
    ) {
      throw new Error("La consulta debe identificar el comprobante emitido.");
    }
  },
);

Deno.test(
  "no acepta como propia una respuesta con QR de otra venta",
  async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        cadena_para_codigo_qr:
          "20100066603 | 03 | B001 | 18 | 15.25 | 100.00 | 07/10/2026 | 1 | hash",
      });
    try {
      await emitirReconciliando(payload, credenciales, fetcher);
      throw new Error("Debió rechazar el comprobante ajeno.");
    } catch (error) {
      if (!(error instanceof ErrorNubefact)) throw error;
      if (error.message.includes("Debió rechazar")) throw error;
    }
  },
);

Deno.test(
  "rechaza rutas no seguras o destinos distintos a NubeFacT",
  async () => {
    const cliente = crearClienteNubefact(
      { ...credenciales, ruta: "http://localhost:9000" },
      fetch,
    );
    try {
      await cliente.emitir(payload);
      throw new Error("Debió rechazar la ruta insegura.");
    } catch (error) {
      if (!(error instanceof ErrorNubefact)) throw error;
      if (error.message.includes("Debió rechazar")) throw error;
    }
  },
);

Deno.test("bloquea emisiones si no se declara el ambiente de NubeFacT", () => {
  try {
    validarConfiguracionEmision({
      ambiente: null,
      rucEmpresa: "20100066603",
      rucEmisor: "20100066603",
      permitirProduccion: false,
    });
    throw new Error("Debió exigir el ambiente de NubeFacT.");
  } catch (error) {
    if (!(error instanceof ErrorNubefact)) throw error;
  }
});

Deno.test(
  "bloquea emisiones si la empresa y la cuenta NubeFacT tienen RUC distinta",
  () => {
    try {
      validarConfiguracionEmision({
        ambiente: "pruebas",
        rucEmpresa: "20100066603",
        rucEmisor: "20987654326",
        permitirProduccion: false,
      });
      throw new Error("Debió rechazar la RUC emisora distinta.");
    } catch (error) {
      if (!(error instanceof ErrorNubefact)) throw error;
    }
  },
);

Deno.test("bloquea producción sin autorización explícita", () => {
  try {
    validarConfiguracionEmision({
      ambiente: "produccion",
      rucEmpresa: "20100066603",
      rucEmisor: "20100066603",
      permitirProduccion: false,
    });
    throw new Error("Debió bloquear la emisión de producción.");
  } catch (error) {
    if (!(error instanceof ErrorNubefact)) throw error;
  }
});

Deno.test("permite pruebas cuando ambiente y RUC emisora coinciden", () => {
  validarConfiguracionEmision({
    ambiente: "pruebas",
    rucEmpresa: "20100066603",
    rucEmisor: "20100066603",
    permitirProduccion: false,
  });
});
