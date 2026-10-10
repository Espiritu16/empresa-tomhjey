import type { Metadata } from "next";
import { connection } from "next/server";
import { cargarAsistente } from "@/funcionalidades/asistente/consultas";
import { PaginaAsistente } from "@/funcionalidades/asistente/pagina-asistente";

export const metadata: Metadata = { title: "Asistente IA" };
export const instant = false;

export default async function AsistentePage() {
  await connection();
  const datos = await cargarAsistente();
  return (
    <PaginaAsistente
      conversacionesIniciales={datos.conversaciones}
      mensajesIniciales={datos.mensajes}
      conversacionInicial={datos.conversacionActual}
      errorInicial={datos.error}
    />
  );
}
