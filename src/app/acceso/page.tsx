import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormularioAcceso } from "@/funcionalidades/acceso/formulario-acceso";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";

export const metadata: Metadata = { title: "Ingresar" };
export const instant = false;

export default function Acceso() {
  return (
    <Suspense fallback={<div aria-busy="true" className="cargando-app" />}>
      <AccesoConSesion />
    </Suspense>
  );
}

async function AccesoConSesion() {
  const perfil = await obtenerPerfilActual();

  if (perfil?.activo) redirect("/panel");

  return (
    <main className="acceso">
      <div className="acceso__contenido">
        <header className="acceso__cabecera">
          <Marca />
          <p className="acceso__cabecera-nota">
            Ventas y facturación de tu empresa
          </p>
        </header>

        <div className="acceso__rejilla">
          <section className="acceso__presentacion">
            <p className="rotulo">TOMHJEY · PANEL DE EMPRESA</p>
            <h1>
              Tu negocio,
              <br />
              en <span>un solo lugar.</span>
            </h1>
            <p className="acceso__presentacion-texto">
              Registra tus ventas, mantén el inventario al día y prepara tus
              comprobantes desde un panel sencillo.
            </p>
            <p className="acceso__nota">
              <span aria-hidden="true" className="acceso__nota-punto" />
              Acceso privado para el equipo de la empresa
            </p>
          </section>

          <section aria-labelledby="titulo-acceso" className="tarjeta-acceso">
            <div className="tarjeta-acceso__encabezado">
              <p className="rotulo">BIENVENIDO DE VUELTA</p>
              <h2 id="titulo-acceso">Inicia sesión</h2>
              <p>Ingresa con el correo y la contraseña de tu cuenta.</p>
            </div>

            <FormularioAcceso />

            <p className="tarjeta-acceso__pie">
              ¿Necesitas acceso? Pídeselo a la persona administradora de tu
              empresa.
            </p>
            {process.env.NODE_ENV === "development" && (
              <a className="vista-previa-enlace" href="/demo-panel">
                Ver una vista previa del panel
              </a>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Marca() {
  return (
    <Link aria-label="Tomhjey, inicio" className="marca" href="/">
      <span aria-hidden="true" className="marca__punto" />
      <span>Tomhjey</span>
    </Link>
  );
}
