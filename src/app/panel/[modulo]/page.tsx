import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";

const modulos = {
  ventas: {
    nombre: "Ventas",
    detalle: "Registro y seguimiento de las ventas de la empresa.",
  },
  productos: {
    nombre: "Productos",
    detalle: "Catálogo y precios de los productos.",
  },
  inventario: {
    nombre: "Inventario",
    detalle: "Existencias y movimientos de inventario.",
  },
  clientes: {
    nombre: "Clientes",
    detalle: "Directorio de clientes y sus datos de contacto.",
  },
  facturacion: {
    nombre: "Facturación",
    detalle: "Comprobantes y configuración de facturación.",
  },
  asistente: {
    nombre: "Asistente IA",
    detalle: "Asistencia inteligente para consultar la operación.",
  },
  usuarios: {
    nombre: "Usuarios",
    detalle: "Accesos y roles del equipo de la empresa.",
  },
} as const;

type NombreModulo = keyof typeof modulos;
export const instant = false;

export default function ModuloEnPreparacion({
  params,
}: {
  params: Promise<{ modulo: string }>;
}) {
  return (
    <Suspense fallback={<div aria-busy="true" className="cargando-app" />}>
      <ModuloConParametros params={params} />
    </Suspense>
  );
}

async function ModuloConParametros({
  params,
}: {
  params: Promise<{ modulo: string }>;
}) {
  const { modulo } = await params;
  if (!(modulo in modulos)) notFound();

  const moduloValido = modulo as NombreModulo;
  if (moduloValido === "usuarios") {
    const perfil = await obtenerPerfilActual();
    if (perfil?.rol !== "administrador") redirect("/panel");
  }

  const contenido = modulos[moduloValido];

  return (
    <>
      <div className="encabezado-seccion">
        <div>
          <p className="rotulo">MÓDULO DEL MVP</p>
          <h1>{contenido.nombre}</h1>
          <p className="encabezado-seccion__texto">{contenido.detalle}</p>
        </div>
      </div>
      <section className="pagina-en-desarrollo">
        <p className="rotulo">SIGUIENTE ETAPA</p>
        <h2>Estamos preparando esta sección</h2>
        <p>
          La navegación y el acceso ya están definidos. Aquí se construirá el
          flujo de {contenido.nombre.toLocaleLowerCase("es-PE")}.
        </p>
      </section>
    </>
  );
}
