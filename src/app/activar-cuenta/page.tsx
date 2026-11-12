import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";
import { FormularioActivacion } from "@/funcionalidades/acceso/formulario-activacion";

export const metadata: Metadata = { title: "Activa tu cuenta" };
export const instant = false;

export default async function ActivarCuenta() {
  await connection();
  const supabase = await crearClienteSupabaseServidor();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) redirect("/acceso");

  return (
    <main className="acceso">
      <div className="acceso__contenido">
        <header className="acceso__cabecera">
          <Link aria-label="Tomhjey, inicio" className="marca" href="/">
            <span aria-hidden="true" className="marca__simbolo">
              T
            </span>
            <span>Tomhjey</span>
          </Link>
          <p className="acceso__cabecera-nota">Acceso al panel de tu empresa</p>
        </header>
        <div className="acceso__rejilla">
          <section className="acceso__presentacion">
            <p className="rotulo">TOMHJEY · PANEL DE EMPRESA</p>
            <h1>
              Tu equipo,
              <br />
              <span>listo para empezar.</span>
            </h1>
            <p className="acceso__presentacion-texto">
              Crea una contraseña para completar tu acceso al panel.
            </p>
          </section>
          <section
            aria-labelledby="titulo-activacion"
            className="tarjeta-acceso"
          >
            <div className="tarjeta-acceso__encabezado">
              <p className="rotulo">INVITACIÓN ACEPTADA</p>
              <h2 id="titulo-activacion">Activa tu cuenta</h2>
              <p>{data.user.email}</p>
            </div>
            <FormularioActivacion />
          </section>
        </div>
      </div>
    </main>
  );
}
