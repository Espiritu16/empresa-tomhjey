export type CredencialesNubefact = {
  ruta: string;
  token: string;
};

export type PayloadNubefact = {
  operacion?: string;
  tipo_de_comprobante: number;
  serie: string;
  numero: number;
  total: number;
  fecha_de_emision: string;
  codigo_unico: string;
  [campo: string]: unknown;
};

export type RespuestaNubefact = Record<string, unknown> & {
  cadena_para_codigo_qr?: string;
};

export class ErrorNubefact extends Error {
  constructor(
    message: string,
    readonly codigo: number | null,
    readonly estadoHttp: number,
  ) {
    super(message);
  }
}

type Fetcher = typeof fetch;

function validarCredenciales(credenciales: CredencialesNubefact): URL {
  let ruta: URL;
  try {
    ruta = new URL(credenciales.ruta);
  } catch {
    throw new ErrorNubefact(
      "La ruta de facturación no está configurada.",
      null,
      503,
    );
  }
  if (
    ruta.protocol !== "https:" ||
    ruta.hostname !== "api.nubefact.com" ||
    !credenciales.token
  ) {
    throw new ErrorNubefact(
      "La configuración de facturación no es válida.",
      null,
      503,
    );
  }
  return ruta;
}

async function pedir(
  credenciales: CredencialesNubefact,
  cuerpo: Record<string, unknown>,
  fetcher: Fetcher,
): Promise<RespuestaNubefact> {
  const ruta = validarCredenciales(credenciales);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const respuesta = await fetcher(ruta, {
      method: "POST",
      headers: {
        Authorization: `Token token="${credenciales.token}"`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
      signal: controller.signal,
    });
    const datos: unknown = await respuesta.json().catch(() => null);
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
      throw new ErrorNubefact(
        "NubeFacT devolvió una respuesta no válida.",
        null,
        respuesta.status,
      );
    }
    const objeto = datos as Record<string, unknown>;
    if (!respuesta.ok || objeto.errors) {
      throw new ErrorNubefact(
        typeof objeto.errors === "string"
          ? objeto.errors
          : "NubeFacT no pudo procesar el comprobante.",
        typeof objeto.codigo === "number" ? objeto.codigo : null,
        respuesta.status,
      );
    }
    return objeto as RespuestaNubefact;
  } catch (error) {
    if (error instanceof ErrorNubefact) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ErrorNubefact(
        "La consulta a NubeFacT excedió el tiempo de espera.",
        null,
        504,
      );
    }
    throw new ErrorNubefact("No se pudo conectar con NubeFacT.", null, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export function crearClienteNubefact(
  credenciales: CredencialesNubefact,
  fetcher: Fetcher = fetch,
) {
  return {
    emitir(payload: PayloadNubefact) {
      return pedir(
        credenciales,
        { ...payload, operacion: "generar_comprobante" },
        fetcher,
      );
    },
    consultar(tipo: number, serie: string, numero: number) {
      return pedir(
        credenciales,
        {
          operacion: "consultar_comprobante",
          tipo_de_comprobante: tipo,
          serie,
          numero,
        },
        fetcher,
      );
    },
  };
}

export function coincideConReserva(
  respuesta: RespuestaNubefact,
  payload: PayloadNubefact,
): boolean {
  const partes = respuesta.cadena_para_codigo_qr
    ?.split("|")
    .map((parte) => parte.trim());
  if (!partes || partes.length < 7) return false;
  const fechaQr = payload.fecha_de_emision.replaceAll("-", "/");
  return (
    partes[2] === payload.serie &&
    Number(partes[3]) === payload.numero &&
    Math.abs(Number(partes[5]) - payload.total) <= 0.01 &&
    partes[6] === fechaQr
  );
}

export async function emitirReconciliando(
  payload: PayloadNubefact,
  credenciales: CredencialesNubefact,
  fetcher: Fetcher = fetch,
): Promise<RespuestaNubefact> {
  const cliente = crearClienteNubefact(credenciales, fetcher);
  try {
    const respuesta = await cliente.emitir(payload);
    if (!coincideConReserva(respuesta, payload)) {
      throw new ErrorNubefact(
        "NubeFacT no devolvió datos suficientes para verificar el comprobante.",
        null,
        502,
      );
    }
    return respuesta;
  } catch (error) {
    if (!(error instanceof ErrorNubefact) || error.codigo !== 23) throw error;
    const respuesta = await cliente.consultar(
      payload.tipo_de_comprobante,
      payload.serie,
      payload.numero,
    );
    if (!coincideConReserva(respuesta, payload)) {
      throw new ErrorNubefact(
        "El número existe en NubeFacT, pero no coincide con esta venta. Requiere revisión.",
        23,
        409,
      );
    }
    return respuesta;
  }
}
