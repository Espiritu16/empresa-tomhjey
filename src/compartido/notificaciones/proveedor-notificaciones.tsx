"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";

type TipoNotificacion = "bien" | "error";

type Notificacion = {
  id: number;
  tipo: TipoNotificacion;
  mensaje: string;
};

type ContextoNotificaciones = {
  exito: (mensaje: string) => void;
  error: (mensaje: string) => void;
};

const ContextoNotificaciones = createContext<ContextoNotificaciones | null>(
  null,
);

export function ProveedorNotificaciones({
  children,
}: Readonly<{ children: ReactNode }>) {
  const siguienteId = useRef(0);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);

  const publicar = useCallback((tipo: TipoNotificacion, mensaje: string) => {
    const texto = mensaje.trim();
    if (!texto) return;

    const id = ++siguienteId.current;
    setNotificaciones((actuales) =>
      [...actuales, { id, tipo, mensaje: texto }].slice(-3),
    );
  }, []);

  const descartar = useCallback((id: number) => {
    setNotificaciones((actuales) => actuales.filter((item) => item.id !== id));
  }, []);

  const contexto = useMemo(
    () => ({
      exito: (mensaje: string) => publicar("bien", mensaje),
      error: (mensaje: string) => publicar("error", mensaje),
    }),
    [publicar],
  );

  const capaNotificaciones = useRef<HTMLElement>(null);

  useEffect(() => {
    const elemento = capaNotificaciones.current;
    if (!elemento?.showPopover) return;

    if (elemento.matches(":popover-open")) elemento.hidePopover();
    if (notificaciones.length) elemento.showPopover();
  }, [notificaciones]);

  return (
    <ContextoNotificaciones.Provider value={contexto}>
      {children}
      <aside
        aria-label="Notificaciones"
        className="notificaciones"
        popover="manual"
        ref={capaNotificaciones}
      >
        {notificaciones.map((notificacion) => (
          <NotificacionEmergente
            descartar={descartar}
            id={notificacion.id}
            key={notificacion.id}
            notificacion={notificacion}
          />
        ))}
      </aside>
    </ContextoNotificaciones.Provider>
  );
}

export function useNotificaciones() {
  const contexto = useContext(ContextoNotificaciones);
  if (!contexto) {
    throw new Error(
      "Las notificaciones solo pueden usarse dentro del panel de empresa.",
    );
  }
  return contexto;
}

function NotificacionEmergente({
  id,
  notificacion,
  descartar,
}: {
  id: number;
  notificacion: Notificacion;
  descartar: (id: number) => void;
}) {
  const cerrar = useCallback(() => descartar(id), [descartar, id]);

  useEffect(() => {
    const duracion = notificacion.tipo === "bien" ? 5000 : 8000;
    const temporizador = window.setTimeout(cerrar, duracion);
    return () => window.clearTimeout(temporizador);
  }, [cerrar, notificacion.tipo]);

  return (
    <div
      aria-atomic="true"
      aria-live={notificacion.tipo === "error" ? "assertive" : "polite"}
      className={`notificacion notificacion--${notificacion.tipo}`}
      role={notificacion.tipo === "error" ? "alert" : "status"}
    >
      <p>{notificacion.mensaje}</p>
      <button
        aria-label="Cerrar notificación"
        className="notificacion__cerrar"
        onClick={cerrar}
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="18"
          viewBox="0 0 24 24"
          width="18"
        >
          <path
            d="m6 6 12 12M18 6 6 18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>
    </div>
  );
}
