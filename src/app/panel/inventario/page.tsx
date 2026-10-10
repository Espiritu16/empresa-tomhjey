import type { Metadata } from "next";
import { connection } from "next/server";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";
import { cargarInventario } from "@/funcionalidades/inventario/consultas";
import { PaginaInventario } from "@/funcionalidades/inventario/pagina-inventario";

export const metadata: Metadata = { title: "Inventario" };
export const instant = false;

export default async function InventarioPage() {
  await connection();
  const [datos, perfil] = await Promise.all([
    cargarInventario(),
    obtenerPerfilActual(),
  ]);
  return (
    <PaginaInventario
      articulos={datos.articulos}
      movimientos={datos.movimientos}
      errorInicial={datos.error}
      puedeAjustar={perfil?.rol === "administrador"}
    />
  );
}
