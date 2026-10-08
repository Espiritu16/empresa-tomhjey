"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import type { ConversacionAsistente, MensajeAsistente } from "./consultas";

export function PaginaAsistente({
  conversacionesIniciales,
  mensajesIniciales,
  conversacionInicial,
  errorInicial,
}: {
  conversacionesIniciales: ConversacionAsistente[];
  mensajesIniciales: MensajeAsistente[];
  conversacionInicial: string | null;
  errorInicial: string | null;
}) {
  const [conversaciones, setConversaciones] = useState(conversacionesIniciales);
  const [mensajes, setMensajes] = useState(mensajesIniciales);
  const [conversacionId, setConversacionId] = useState(conversacionInicial);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(errorInicial);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const mensaje = texto.trim();
    if (!mensaje || enviando) return;
    setError(null);
    setEnviando(true);
    setMensajes((actuales) => [
      ...actuales,
      {
        id: `temporal-${Date.now()}`,
        rol: "usuario",
        contenido: mensaje,
        creadoEn: new Date().toISOString(),
      },
    ]);
    setTexto("");
    try {
      const supabase = crearClienteSupabase();
      const { data, error: errorFuncion } = await supabase.functions.invoke(
        "asistente",
        {
          body: { mensaje, ...(conversacionId ? { conversacionId } : {}) },
        },
      );
      if (errorFuncion || !data?.mensaje || !data?.conversacionId) {
        throw new Error(await detalleError(errorFuncion));
      }
      setConversacionId(data.conversacionId);
      setMensajes((actuales) => [
        ...actuales,
        {
          id: `respuesta-${Date.now()}`,
          rol: "asistente",
          contenido: data.mensaje,
          creadoEn: new Date().toISOString(),
        },
      ]);
      setConversaciones((actuales) => {
        const existente = actuales.find(
          (item) => item.id === data.conversacionId,
        );
        if (existente)
          return actuales.map((item) =>
            item.id === existente.id
              ? { ...item, actualizadaEn: new Date().toISOString() }
              : item,
          );
        return [
          {
            id: data.conversacionId,
            titulo: mensaje.slice(0, 80),
            actualizadaEn: new Date().toISOString(),
          },
          ...actuales,
        ];
      });
    } catch (errorEnvio) {
      setMensajes((actuales) =>
        actuales.filter((item) => !item.id.startsWith("temporal-")),
      );
      setError(
        errorEnvio instanceof Error
          ? errorEnvio.message
          : "No se pudo completar la consulta. Inténtalo de nuevo.",
      );
      setTexto(mensaje);
    } finally {
      setEnviando(false);
    }
  }

  async function abrirConversacion(id: string) {
    setError(null);
    const supabase = crearClienteSupabase();
    const { data, error: errorConsulta } = await supabase
      .from("mensajes")
      .select("id, rol, contenido, creado_en")
      .eq("conversacion_id", id)
      .order("creado_en", { ascending: true });
    if (errorConsulta) {
      setError("No se pudo abrir esa conversación.");
      return;
    }
    setConversacionId(id);
    setMensajes(
      (data ?? []).map((item) => ({
        id: item.id,
        rol: item.rol,
        contenido: item.contenido,
        creadoEn: item.creado_en,
      })) as MensajeAsistente[],
    );
  }

  function nuevaConversacion() {
    setConversacionId(null);
    setMensajes([]);
    setTexto("");
    setError(null);
  }

  return (
    <section className="modulo-operativo asistente-modulo">
      <header className="encabezado-seccion">
        <div>
          <p className="rotulo">AYUDA PARA EL DÍA A DÍA</p>
          <h1>Asistente IA</h1>
          <p className="encabezado-seccion__texto">
            Consulta información de tu empresa o pide ayuda para preparar un
            borrador de venta.
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
      <div className="asistente-modulo__rejilla">
        <aside
          aria-label="Conversaciones anteriores"
          className="modulo-operativo__panel asistente-modulo__historial"
        >
          <div className="tarjeta-panel__encabezado">
            <h2>Conversaciones</h2>
            <button
              className="modulo-operativo__boton-texto"
              onClick={nuevaConversacion}
              type="button"
            >
              Nueva
            </button>
          </div>
          {conversaciones.length ? (
            <nav className="asistente-modulo__lista">
              {conversaciones.map((conversacion) => (
                <button
                  aria-current={
                    conversacion.id === conversacionId ? "page" : undefined
                  }
                  key={conversacion.id}
                  onClick={() => abrirConversacion(conversacion.id)}
                  type="button"
                >
                  {conversacion.titulo}
                </button>
              ))}
            </nav>
          ) : (
            <p className="modulo-operativo__nota">
              Tus consultas aparecerán aquí.
            </p>
          )}
        </aside>
        <section
          aria-label="Chat con el asistente"
          className="modulo-operativo__panel asistente-modulo__chat"
        >
          <div aria-live="polite" className="asistente-modulo__mensajes">
            {mensajes.length ? (
              mensajes.map((mensaje) => (
                <article
                  className={`asistente-modulo__mensaje asistente-modulo__mensaje--${mensaje.rol}`}
                  key={mensaje.id}
                >
                  <span>{mensaje.rol === "usuario" ? "Tú" : "Asistente"}</span>
                  <p>{mensaje.contenido}</p>
                </article>
              ))
            ) : (
              <div className="modulo-operativo__vacio">
                <strong>¿Qué necesitas resolver?</strong>
                <span>
                  Pregunta por productos, existencias, ventas o el uso del
                  panel.
                </span>
                <div className="asistente-modulo__ejemplos">
                  <button
                    onClick={() => setTexto("¿Qué productos debo reponer?")}
                    type="button"
                  >
                    ¿Qué productos debo reponer?
                  </button>
                  <button
                    onClick={() => setTexto("Resume las ventas de hoy")}
                    type="button"
                  >
                    Resume las ventas de hoy
                  </button>
                </div>
              </div>
            )}
          </div>
          <form className="asistente-modulo__formulario" onSubmit={enviar}>
            <label className="campo">
              <span className="sr-only">Mensaje para el asistente</span>
              <textarea
                aria-label="Mensaje para el asistente"
                maxLength={4000}
                onChange={(evento) => setTexto(evento.target.value)}
                placeholder="Escribe tu consulta…"
                required
                rows={3}
                value={texto}
              />
            </label>
            <div className="asistente-modulo__pie">
              <span>
                La IA prepara información y borradores; tú decides cuándo
                confirmar una venta.
              </span>
              <button
                className="boton-principal"
                disabled={enviando}
                type="submit"
              >
                {enviando ? "Consultando…" : "Enviar mensaje"}
              </button>
            </div>
          </form>
        </section>
      </div>
      <p className="modulo-operativo__nota">
        Revisa los importes y los datos antes de confirmar una operación.{" "}
        <Link href="/panel/ventas">Ir a ventas</Link>
      </p>
    </section>
  );
}

async function detalleError(
  error: { message: string; context?: unknown } | null,
) {
  if (!error) return "No se recibió una respuesta válida del asistente.";
  const contexto = error.context;
  if (contexto instanceof Response) {
    try {
      const cuerpo = (await contexto.clone().json()) as { detalle?: string };
      if (cuerpo.detalle) return cuerpo.detalle;
    } catch {
      /* Conserva un mensaje seguro cuando la respuesta no sea JSON. */
    }
  }
  return (
    error.message || "No se pudo completar la consulta. Inténtalo de nuevo."
  );
}
