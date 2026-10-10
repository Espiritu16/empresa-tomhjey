import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";
import { cargarPaginaFacturacion } from "@/funcionalidades/facturacion/consultas";
import { PaginaFacturacion } from "@/funcionalidades/facturacion/pagina-facturacion";

export const metadata: Metadata = { title: "Facturación" };
export const instant = false;

export default async function FacturacionPage() {
  await connection();
  const perfil = await obtenerPerfilActual();
  if (perfil?.rol !== "administrador" && perfil?.rol !== "vendedor") {
    redirect("/panel");
  }

  const datos = await cargarPaginaFacturacion();
  return (
    <PaginaFacturacion
      datos={datos}
      esAdministrador={perfil?.rol === "administrador"}
    />
  );
}
