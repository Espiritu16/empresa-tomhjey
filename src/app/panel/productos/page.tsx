import type { Metadata } from "next";
import { connection } from "next/server";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";
import { cargarProductos } from "@/funcionalidades/productos/consultas";
import { PaginaProductos } from "@/funcionalidades/productos/pagina-productos";

export const metadata: Metadata = { title: "Productos" };
export const instant = false;

export default async function ProductosPage() {
  await connection();
  const [datos, perfil] = await Promise.all([
    cargarProductos(),
    obtenerPerfilActual(),
  ]);
  return (
    <PaginaProductos
      categorias={datos.categorias}
      errorInicial={datos.error}
      productos={datos.productos}
      usuarioId={perfil?.id ?? ""}
      puedeGestionarProductos={
        perfil?.rol === "administrador" || perfil?.rol === "vendedor"
      }
      esAdministrador={perfil?.rol === "administrador"}
    />
  );
}
