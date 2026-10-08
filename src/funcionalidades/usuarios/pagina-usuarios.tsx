"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import type { InvitacionEquipo, UsuarioEquipo } from "./consultas";

export function PaginaUsuarios({
  usuarios,
  invitaciones,
  errorInicial,
}: {
  usuarios: UsuarioEquipo[];
  invitaciones: InvitacionEquipo[];
  errorInicial: string | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [correo, setCorreo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [usuarioActualizando, setUsuarioActualizando] = useState<string | null>(
    null,
  );
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState(errorInicial);

  async function invitar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setMensaje(null);
    const direccion = correo.trim().toLowerCase();
    if (!direccion) {
      setError("Escribe el correo de la persona que quieres invitar.");
      return;
    }
    setGuardando(true);
    const { data, error: errorInvitacion } =
      await crearClienteSupabase().functions.invoke("invitar-vendedor", {
        body: { correo: direccion },
      });
    setGuardando(false);
    if (errorInvitacion) {
      setError(
        errorInvitacion.message.includes("Failed to fetch")
          ? "La función de invitaciones no está disponible en local. Inicia las Edge Functions y vuelve a intentar."
          : "No se pudo enviar la invitación. Revisa el correo e inténtalo de nuevo.",
      );
      return;
    }
    if (!data?.invitacionId) {
      setError(
        "La invitación no devolvió una confirmación. Inténtalo otra vez.",
      );
      return;
    }
    setMensaje("La invitación se envió.");
    setCorreo("");
    setAbierto(false);
    router.refresh();
  }

  async function cambiarEstado(usuario: UsuarioEquipo) {
    setError(null);
    setMensaje(null);
    setUsuarioActualizando(usuario.id);
    const { error: errorCambio } = await crearClienteSupabase().rpc(
      "cambiar_estado_vendedor",
      { usuario_objetivo: usuario.id, activar: !usuario.activo },
    );
    setUsuarioActualizando(null);
    if (errorCambio) {
      setError("No se pudo actualizar el acceso del vendedor.");
      return;
    }
    setMensaje(
      usuario.activo
        ? "El acceso del vendedor se desactivó."
        : "El acceso del vendedor se activó.",
    );
    router.refresh();
  }

  return (
    <section className="modulo-operativo">
      <header className="encabezado-seccion">
        <div>
          <p className="rotulo">ACCESOS DE LA EMPRESA</p>
          <h1>Usuarios</h1>
          <p className="encabezado-seccion__texto">
            Invita vendedores y activa o pausa sus accesos.
          </p>
        </div>
      </header>
      {error ? (
        <p
          aria-live="assertive"
          className="modulo-operativo__aviso modulo-operativo__aviso--error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {mensaje ? (
        <p
          aria-live="polite"
          className="modulo-operativo__aviso modulo-operativo__aviso--bien"
        >
          {mensaje}
        </p>
      ) : null}
      <div className="modulo-operativo__barra">
        <p>{usuarios.length} cuentas de usuario</p>
        <button
          className="boton-principal"
          onClick={() => {
            setError(null);
            setAbierto(true);
          }}
          type="button"
        >
          Invitar vendedor
        </button>
      </div>
      <div className="modulo-operativo__tabla-contenedor">
        <table className="modulo-operativo__tabla">
          <thead>
            <tr>
              <th scope="col">Persona</th>
              <th scope="col">Rol</th>
              <th scope="col">Acceso</th>
              <th scope="col">Desde</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id}>
                <td>{usuario.nombre}</td>
                <td>
                  {usuario.rol === "administrador"
                    ? "Administrador"
                    : "Vendedor"}
                </td>
                <td>
                  <span
                    className={`modulo-operativo__estado${usuario.activo ? " modulo-operativo__estado--activo" : ""}`}
                  >
                    {usuario.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td>{formatearFecha(usuario.creadoEn)}</td>
                <td>
                  {usuario.rol === "vendedor" ? (
                    <button
                      aria-label={`${usuario.activo ? "Desactivar" : "Activar"} ${usuario.nombre}`}
                      className="modulo-operativo__boton-texto"
                      disabled={usuarioActualizando === usuario.id}
                      onClick={() => void cambiarEstado(usuario)}
                      type="button"
                    >
                      {usuario.activo ? "Desactivar" : "Activar"}
                    </button>
                  ) : (
                    <span className="modulo-operativo__nota">
                      Acceso principal
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section
        aria-labelledby="invitaciones-titulo"
        className="modulo-operativo__panel"
      >
        <div className="tarjeta-panel__encabezado">
          <div>
            <p className="rotulo">EQUIPO</p>
            <h2 id="invitaciones-titulo">Invitaciones recientes</h2>
          </div>
        </div>
        {invitaciones.length ? (
          <div className="modulo-operativo__tabla-contenedor">
            <table className="modulo-operativo__tabla">
              <thead>
                <tr>
                  <th scope="col">Correo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Vence</th>
                </tr>
              </thead>
              <tbody>
                {invitaciones.map((invitacion) => (
                  <tr key={invitacion.id}>
                    <td>{invitacion.correo}</td>
                    <td>
                      {invitacion.estado === "pendiente"
                        ? "Pendiente"
                        : invitacion.estado === "aceptada"
                          ? "Aceptada"
                          : "Cancelada"}
                    </td>
                    <td>{formatearFecha(invitacion.expiraEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="modulo-operativo__vacio">
            No hay invitaciones recientes.
          </p>
        )}
      </section>

      {abierto ? (
        <div className="modulo-operativo__dialogo-fondo">
          <section
            aria-labelledby="invitacion-titulo"
            aria-modal="true"
            className="modulo-operativo__dialogo"
            role="dialog"
          >
            <h2 id="invitacion-titulo">Invitar a un vendedor</h2>
            <p className="modulo-operativo__nota">
              Se enviará un correo para que la persona configure su acceso.
            </p>
            <form className="modulo-operativo__formulario" onSubmit={invitar}>
              <label className="campo modulo-operativo__ancho-completo">
                <span>Correo electrónico</span>
                <input
                  autoComplete="email"
                  onChange={(evento) => setCorreo(evento.target.value)}
                  required
                  type="email"
                  value={correo}
                />
              </label>
              {error ? (
                <p
                  className="modulo-operativo__aviso modulo-operativo__aviso--error modulo-operativo__ancho-completo"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <div className="modulo-operativo__acciones modulo-operativo__ancho-completo">
                <button
                  className="boton-principal"
                  disabled={guardando}
                  type="submit"
                >
                  {guardando ? "Enviando…" : "Enviar invitación"}
                </button>
                <button
                  className="modulo-operativo__boton-secundario"
                  disabled={guardando}
                  onClick={() => setAbierto(false)}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function formatearFecha(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(
    new Date(fecha),
  );
}
