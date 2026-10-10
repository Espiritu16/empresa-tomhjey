"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";

export function FormularioActivacion() {
  const router = useRouter();
  const [clave, setClave] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    if (clave !== confirmacion) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setOcupado(true);
    try {
      const supabase = crearClienteSupabase();
      const { data: usuario, error: errorClave } =
        await supabase.auth.updateUser({ password: clave });
      if (errorClave || !usuario.user) {
        setError(
          "No se pudo guardar la contraseña. Revisa los datos e inténtalo de nuevo.",
        );
        return;
      }

      router.replace("/panel");
      router.refresh();
    } catch {
      setError("No se pudo activar la cuenta. Inténtalo de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form className="formulario-acceso" onSubmit={activar}>
      <div className="campo">
        <label htmlFor="nueva-clave">Nueva contraseña</label>
        <div className="campo__control">
          <input
            autoComplete="new-password"
            id="nueva-clave"
            minLength={6}
            onChange={(evento) => setClave(evento.target.value)}
            required
            type="password"
            value={clave}
          />
        </div>
      </div>
      <div className="campo">
        <label htmlFor="repite-clave">Repite la contraseña</label>
        <div className="campo__control">
          <input
            autoComplete="new-password"
            id="repite-clave"
            onChange={(evento) => setConfirmacion(evento.target.value)}
            required
            type="password"
            value={confirmacion}
          />
        </div>
      </div>
      {error ? (
        <p aria-live="polite" className="formulario-acceso__error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="boton-principal" disabled={ocupado} type="submit">
        {ocupado ? "Activando…" : "Activar cuenta"}
      </button>
    </form>
  );
}
