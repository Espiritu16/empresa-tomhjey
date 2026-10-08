import type { Metadata } from "next";
import { cargarAsistente } from "@/funcionalidades/asistente/consultas";
import { PaginaAsistente } from "@/funcionalidades/asistente/pagina-asistente";

export const metadata: Metadata = { title: "Asistente IA" };

export default async function AsistentePage() {
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
