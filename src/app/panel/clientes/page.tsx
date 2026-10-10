import type { Metadata } from "next";
import { connection } from "next/server";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";
import { cargarClientes } from "@/funcionalidades/clientes/consultas";
import { PaginaClientes } from "@/funcionalidades/clientes/pagina-clientes";

export const metadata: Metadata = { title: "Clientes" };
export const instant = false;

export default async function ClientesPage() {
  await connection();
  const [datos, perfil] = await Promise.all([
    cargarClientes(),
    obtenerPerfilActual(),
  ]);
  return (
    <PaginaClientes
      clientes={datos.clientes}
      ventasPorCliente={datos.ventasPorCliente}
      errorInicial={datos.error}
      usuarioId={perfil?.id ?? ""}
      puedeEditarEstado={perfil?.rol === "administrador"}
    />
  );
}
