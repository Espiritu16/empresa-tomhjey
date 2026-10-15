import { NextResponse, type NextRequest } from "next/server";
import { consultarDocumentoSunat } from "@/funcionalidades/clientes/consulta-sunat";
import { documentoConsultable } from "@/funcionalidades/clientes/validaciones-documentos";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";

export async function POST(request: NextRequest) {
  const perfil = await obtenerPerfilActual();
  if (!perfil?.activo) {
    return responder(
      { error: "Inicia sesión para consultar documentos." },
      401,
    );
  }

  const cuerpo: unknown = await request.json().catch(() => null);
  const datos =
    typeof cuerpo === "object" && cuerpo !== null
      ? (cuerpo as Record<string, unknown>)
      : {};
  const tipoDocumento =
    typeof datos.tipoDocumento === "string" ? datos.tipoDocumento : "";
  const numeroDocumento =
    typeof datos.numeroDocumento === "string"
      ? datos.numeroDocumento.trim()
      : "";

  if (!documentoConsultable(tipoDocumento, numeroDocumento)) {
    return responder(
      {
        error:
          tipoDocumento === "dni"
            ? "Escribe un DNI de ocho dígitos."
            : "Escribe un RUC válido de once dígitos.",
      },
      400,
    );
  }

  try {
    const datos = await consultarDocumentoSunat(tipoDocumento, numeroDocumento);
    return responder(datos, 200);
  } catch (error) {
    if (error instanceof Error && error.message === "documento_no_encontrado") {
      return responder(
        { error: "SUNAT no encontró datos para ese documento." },
        404,
      );
    }

    if (error instanceof Error && error.name === "TimeoutError") {
      return responder(
        { error: "SUNAT está demorando. Puedes completar los datos a mano." },
        504,
      );
    }

    return responder(
      { error: "SUNAT no está disponible. Puedes completar los datos a mano." },
      502,
    );
  }
}

function responder(cuerpo: object, status: number) {
  return NextResponse.json(cuerpo, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
