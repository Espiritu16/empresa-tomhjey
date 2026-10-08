import type { Metadata } from "next";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";
import { cargarClientes } from "@/funcionalidades/clientes/consultas";
import { PaginaClientes } from "@/funcionalidades/clientes/pagina-clientes";

export const metadata: Metadata = { title: "Clientes" };
export const instant = false;

export default async function ClientesPage() {
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
    />
  );
}
