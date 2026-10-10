import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";
import { cargarEmpresa } from "@/funcionalidades/empresa/consultas";
import { PaginaEmpresa } from "@/funcionalidades/empresa/pagina-empresa";

export const metadata: Metadata = { title: "Empresa y configuración" };
export const instant = false;

export default async function EmpresaPage() {
  await connection();
  const perfil = await obtenerPerfilActual();
  if (perfil?.rol !== "administrador") redirect("/panel");
  const datos = await cargarEmpresa();
  return <PaginaEmpresa empresa={datos.empresa} errorInicial={datos.error} />;
}
