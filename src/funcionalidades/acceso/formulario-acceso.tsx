"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";

export function FormularioAcceso() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [mostrarClave, setMostrarClave] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setOcupado(true);
    setError(null);

    try {
      const supabase = crearClienteSupabase();
      const { error: errorAcceso } = await supabase.auth.signInWithPassword({
        email: correo.trim(),
        password: clave,
      });

      if (errorAcceso) {
        setError(
          "No pudimos iniciar sesión. Revisa el correo y la contraseña.",
        );
        return;
      }

      router.replace("/panel");
      router.refresh();
    } catch {
      setError(
        "No se pudo conectar con Supabase. Revisa la configuración local del proyecto e inténtalo de nuevo.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form className="formulario-acceso" method="post" onSubmit={entrar}>
      <div className="campo">
        <label htmlFor="correo">Correo electrónico</label>
        <div className="campo__control">
          <input
            autoComplete="username"
            id="correo"
            name="correo"
            onChange={(evento) => setCorreo(evento.target.value)}
            placeholder="nombre@empresa.com"
            required
            type="email"
            value={correo}
          />
        </div>
      </div>

      <div className="campo">
        <label htmlFor="clave">Contraseña</label>
        <div className="campo__control">
          <input
            autoComplete="current-password"
            id="clave"
            name="clave"
            onChange={(evento) => setClave(evento.target.value)}
            placeholder="Escribe tu contraseña"
            required
            type={mostrarClave ? "text" : "password"}
            value={clave}
          />
          <button
            aria-label={
              mostrarClave ? "Ocultar contraseña" : "Mostrar contraseña"
            }
            aria-pressed={mostrarClave}
            className="campo__ojo"
            onClick={() => setMostrarClave((actual) => !actual)}
            type="button"
          >
            {mostrarClave ? <OjoCerrado /> : <OjoAbierto />}
          </button>
        </div>
      </div>

      {error && (
        <p aria-live="polite" className="formulario-acceso__error" role="alert">
          {error}
        </p>
      )}

      <button className="boton-principal" disabled={ocupado} type="submit">
        {ocupado ? "Ingresando…" : "Ingresar al panel"}
        {!ocupado && <Flecha />}
      </button>
    </form>
  );
}

function OjoAbierto() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="19"
      viewBox="0 0 24 24"
      width="19"
    >
      <path
        d="M3 12s3.4-6 9-6 9 6 9 6-3.4 6-9 6-9-6-9-6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function OjoCerrado() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="19"
      viewBox="0 0 24 24"
      width="19"
    >
      <path
        d="M4 4 20 20M10.6 6.2A9.7 9.7 0 0 1 12 6c5.6 0 9 6 9 6a13.6 13.6 0 0 1-3.1 3.8M6.2 7.5C4.2 9 3 12 3 12s3.4 6 9 6c.7 0 1.4-.1 2-.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function Flecha() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="17"
      viewBox="0 0 24 24"
      width="17"
    >
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
