"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import { DialogoModal } from "@/compartido/componentes/dialogo-modal";
import { useNotificaciones } from "@/compartido/notificaciones/proveedor-notificaciones";
import type { UsuarioEquipo } from "./consultas";

export function PaginaUsuarios({
  usuarios,
  errorInicial,
}: {
  usuarios: UsuarioEquipo[];
  errorInicial: string | null;
}) {
  const router = useRouter();
  const notificaciones = useNotificaciones();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [rol, setRol] = useState<"administrador" | "vendedor">("vendedor");
  const [guardando, setGuardando] = useState(false);
  const [usuarioActualizando, setUsuarioActualizando] = useState<string | null>(
    null,
  );
  const [error, setError] = useState(errorInicial);

  async function crearUsuario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    const nombreLimpio = nombre.trim();
    const direccion = correo.trim().toLowerCase();
    if (!nombreLimpio) {
      setError("Escribe el nombre de la persona.");
      return;
    }
    if (!direccion) {
      setError("Escribe el correo de la persona.");
      return;
    }
    if (clave.length < 6) {
      setError("La contraseña inicial debe tener al menos 6 caracteres.");
      return;
    }
    setGuardando(true);
    const { data, error: errorCreacion } =
      await crearClienteSupabase().functions.invoke("crear-usuario", {
        body: { nombre: nombreLimpio, correo: direccion, clave, rol },
      });
    setGuardando(false);
    if (errorCreacion) {
      notificaciones.error(
        errorCreacion.message.includes("Failed to fetch")
          ? "La función para crear usuarios no está disponible. Inicia las Edge Functions y vuelve a intentar."
          : "No se pudo crear la cuenta. Revisa el correo y la contraseña e inténtalo de nuevo.",
      );
      return;
    }
    if (!data?.usuarioId) {
      notificaciones.error(
        "No se recibió confirmación de la cuenta. Inténtalo otra vez.",
      );
      return;
    }
    notificaciones.exito(
      `La cuenta ${direccion} se creó. Comparte la contraseña inicial con la persona.`,
    );
    setNombre("");
    setCorreo("");
    setClave("");
    setRol("vendedor");
    setAbierto(false);
    router.refresh();
  }

  async function cambiarEstado(usuario: UsuarioEquipo) {
    setError(null);
    setUsuarioActualizando(usuario.id);
    const { error: errorCambio } = await crearClienteSupabase().rpc(
      "cambiar_estado_vendedor",
      { usuario_objetivo: usuario.id, activar: !usuario.activo },
    );
    setUsuarioActualizando(null);
    if (errorCambio) {
      notificaciones.error("No se pudo actualizar el acceso del vendedor.");
      return;
    }
    notificaciones.exito(
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
            Crea cuentas de administración o ventas y gestiona sus accesos.
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
      <div className="modulo-operativo__barra">
        <p>{usuarios.length} cuentas de usuario</p>
        <button
          className="boton-principal"
          onClick={() => {
            setError(null);
            setNombre("");
            setCorreo("");
            setClave("");
            setRol("vendedor");
            setAbierto(true);
          }}
          type="button"
        >
          Nuevo usuario
        </button>
      </div>
      <div className="modulo-operativo__tabla-contenedor">
        <table className="modulo-operativo__tabla">
          <thead>
            <tr>
              <th scope="col">Persona</th>
              <th scope="col">Correo electrónico</th>
              <th scope="col">Rol</th>
              <th scope="col">Acceso</th>
              <th scope="col">Desde</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.id}>
                <td data-etiqueta="Persona" data-principal>
                  {usuario.nombre}
                </td>
                <td data-etiqueta="Correo electrónico">
                  {usuario.correo ?? "Sin correo"}
                </td>
                <td data-etiqueta="Rol">
                  {usuario.rol === "administrador"
                    ? "Administrador"
                    : "Vendedor"}
                </td>
                <td data-etiqueta="Acceso">
                  <span
                    className={`modulo-operativo__estado${usuario.activo ? " modulo-operativo__estado--activo" : ""}`}
                  >
                    {usuario.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td data-etiqueta="Desde">
                  {formatearFecha(usuario.creadoEn)}
                </td>
                <td data-etiqueta="Acciones" data-acciones>
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

      <DialogoModal
        abierto={abierto}
        bloqueado={guardando}
        onCerrar={() => setAbierto(false)}
        titulo="Nuevo usuario"
      >
        <p className="modulo-operativo__nota">
          La cuenta queda lista para iniciar sesión. No se envía ningún correo.
        </p>
        <form className="modulo-operativo__formulario" onSubmit={crearUsuario}>
          <label className="campo modulo-operativo__ancho-completo">
            <span>Nombre completo</span>
            <input
              autoComplete="name"
              maxLength={120}
              onChange={(evento) => setNombre(evento.target.value)}
              required
              value={nombre}
            />
          </label>
          <label className="campo modulo-operativo__ancho-completo">
            <span>Correo electrónico</span>
            <input
              autoComplete="email"
              maxLength={254}
              onChange={(evento) => setCorreo(evento.target.value)}
              required
              type="email"
              value={correo}
            />
          </label>
          <label className="campo modulo-operativo__ancho-completo">
            <span>Rol</span>
            <select
              onChange={(evento) =>
                setRol(evento.target.value as "administrador" | "vendedor")
              }
              value={rol}
            >
              <option value="vendedor">Vendedor</option>
              <option value="administrador">Administrador</option>
            </select>
          </label>
          <label className="campo modulo-operativo__ancho-completo">
            <span>Contraseña inicial</span>
            <input
              autoComplete="new-password"
              minLength={6}
              maxLength={128}
              onChange={(evento) => setClave(evento.target.value)}
              required
              type="password"
              value={clave}
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
          <div className="modulo-operativo__acciones modulo-operativo__acciones--dialogo modulo-operativo__ancho-completo">
            <button
              className="modulo-operativo__boton-secundario"
              disabled={guardando}
              onClick={() => setAbierto(false)}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="boton-principal"
              disabled={guardando}
              type="submit"
            >
              {guardando ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </form>
      </DialogoModal>
    </section>
  );
}

function formatearFecha(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(
    new Date(fecha),
  );
}
