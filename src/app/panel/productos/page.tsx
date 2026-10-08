import type { Metadata } from "next";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";
import { cargarProductos } from "@/funcionalidades/productos/consultas";
import { PaginaProductos } from "@/funcionalidades/productos/pagina-productos";

export const metadata: Metadata = { title: "Productos" };
export const instant = false;

export default async function ProductosPage() {
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
      puedeEditar={perfil?.rol === "administrador"}
    />
  );
}
