import "server-only";
import type { TipoDocumentoConsultable } from "./validaciones-documentos";

export type ResultadoConsultaSunat = {
  nombre: string;
  direccion: string | null;
  tipoRuc?: "persona_natural" | "persona_juridica" | "otro";
};

type RegistroSunat = {
  nombresapellidos?: unknown;
  apenomdenunciado?: unknown;
  direstablecimiento?: unknown;
};

type RespuestaSunat = {
  message?: unknown;
  lista?: unknown;
};

export async function consultarDocumentoSunat(
  tipoDocumento: TipoDocumentoConsultable,
  numeroDocumento: string,
  obtener: typeof fetch = fetch,
): Promise<ResultadoConsultaSunat> {
  const parametros = new URLSearchParams({
    accion: tipoDocumento === "dni" ? "obtenerDatosDni" : "obtenerDatosRuc",
    [tipoDocumento === "dni" ? "numDocumento" : "nroRuc"]: numeroDocumento,
  });
  const respuesta = await obtener(
    `https://ww1.sunat.gob.pe/ol-ti-itfisdenreg/itfisdenreg.htm?${parametros}`,
    {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    },
  );

  if (!respuesta.ok) throw new Error("sunat_no_disponible");

  const datos = (await respuesta.json()) as RespuestaSunat;
  if (datos.message !== "success" || !Array.isArray(datos.lista)) {
    throw new Error("sunat_no_disponible");
  }

  const registro = datos.lista[0] as RegistroSunat | undefined;
  const nombre = limpiarDato(
    tipoDocumento === "dni"
      ? registro?.nombresapellidos
      : registro?.apenomdenunciado,
  );

  if (!registro || !nombre) throw new Error("documento_no_encontrado");

  if (tipoDocumento === "dni") return { nombre, direccion: null };

  const prefijo = numeroDocumento.slice(0, 2);
  return {
    nombre,
    direccion: limpiarDato(registro.direstablecimiento) || null,
    tipoRuc:
      prefijo === "10"
        ? "persona_natural"
        : prefijo === "20"
          ? "persona_juridica"
          : "otro",
  };
}

function limpiarDato(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}
