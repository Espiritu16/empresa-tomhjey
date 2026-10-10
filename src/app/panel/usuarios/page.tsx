import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";
import { cargarEquipo } from "@/funcionalidades/usuarios/consultas";
import { PaginaUsuarios } from "@/funcionalidades/usuarios/pagina-usuarios";

export const metadata: Metadata = { title: "Usuarios" };
export const instant = false;

export default async function UsuariosPage() {
  await connection();
  const perfil = await obtenerPerfilActual();
  if (perfil?.rol !== "administrador") redirect("/panel");
  const datos = await cargarEquipo();
  return (
    <PaginaUsuarios
      usuarios={datos.usuarios}
      invitaciones={datos.invitaciones}
      errorInicial={datos.error}
    />
  );
}
