"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type Propiedades = {
  abierto: boolean;
  titulo: string;
  bloqueado?: boolean;
  /** `amplio` para contenido con tablas, como la sugerencia de reposición. */
  ancho?: "normal" | "amplio";
  onCerrar: () => void;
  children: ReactNode;
};

export function DialogoModal({
  abierto,
  titulo,
  bloqueado = false,
  ancho = "normal",
  onCerrar,
  children,
}: Propiedades) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const tituloId = useId();

  useEffect(() => {
    const elemento = dialogo.current;
    if (!elemento) return;

    if (abierto && !elemento.open) elemento.showModal();
    if (!abierto && elemento.open) elemento.close();

    return () => {
      if (elemento.open) elemento.close();
    };
  }, [abierto]);

  return (
    <dialog
      aria-labelledby={tituloId}
      className={
        ancho === "amplio"
          ? "modulo-operativo__dialogo modulo-operativo__dialogo--amplio"
          : "modulo-operativo__dialogo"
      }
      onCancel={(evento) => {
        evento.preventDefault();
        if (!bloqueado) onCerrar();
      }}
      ref={dialogo}
    >
      <h2 className="modulo-operativo__dialogo-titulo" id={tituloId}>
        {titulo}
      </h2>
      <div className="modulo-operativo__dialogo-contenido">{children}</div>
    </dialog>
  );
}
