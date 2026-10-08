import type { Metadata } from "next";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";
import { cargarVentas } from "@/funcionalidades/ventas/consultas";
import { PaginaVentas } from "@/funcionalidades/ventas/pagina-ventas";

export const metadata: Metadata = { title: "Ventas" };
export const instant = false;

export default async function VentasPage() {
  const [datos, perfil] = await Promise.all([
    cargarVentas(),
    obtenerPerfilActual(),
  ]);
  return (
    <PaginaVentas
      ventas={datos.ventas}
      clientes={datos.clientes}
      productos={datos.productos}
      usuarioId={perfil?.id ?? ""}
      esAdministrador={perfil?.rol === "administrador"}
      errorInicial={datos.error}
    />
  );
}
