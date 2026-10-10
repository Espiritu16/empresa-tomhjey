"use client";

import { useEffect, useId, useRef } from "react";
import estilos from "./dialogo-confirmacion.module.css";

type Propiedades = {
  abierto: boolean;
  titulo: string;
  descripcion: string;
  textoConfirmar: string;
  textoCancelar?: string;
  error?: string | null;
  procesando?: boolean;
  variante?: "normal" | "peligro";
  onConfirmar: () => void | Promise<void>;
  onCancelar: () => void;
};

export function DialogoConfirmacion({
  abierto,
  titulo,
  descripcion,
  textoConfirmar,
  textoCancelar = "Cancelar",
  error,
  procesando = false,
  variante = "normal",
  onConfirmar,
  onCancelar,
}: Propiedades) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const tituloId = useId();
  const descripcionId = useId();
  const errorId = useId();

  useEffect(() => {
    const elemento = dialogo.current;
    if (!elemento) return;

    if (abierto && !elemento.open) elemento.showModal();
    if (!abierto && elemento.open) elemento.close();

    return () => {
      if (elemento.open) elemento.close();
    };
  }, [abierto]);

  function cancelar(evento: React.SyntheticEvent<HTMLDialogElement>) {
    if (evento.type === "cancel") evento.preventDefault();
    onCancelar();
  }

  return (
    <dialog
      aria-describedby={descripcionId}
      aria-labelledby={tituloId}
      aria-modal="true"
      className={estilos.dialogo}
      onCancel={cancelar}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget && !procesando) {
          onCancelar();
        }
      }}
      ref={dialogo}
    >
      <div className={estilos.contenido}>
        <span aria-hidden="true" className={estilos.icono}>
          !
        </span>
        <div className={estilos.texto}>
          <h2 className={estilos.titulo} id={tituloId}>
            {titulo}
          </h2>
          <p className={estilos.descripcion} id={descripcionId}>
            {descripcion}
          </p>
        </div>
      </div>
      {error ? (
        <p
          aria-live="assertive"
          className={estilos.error}
          id={errorId}
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className={estilos.acciones}>
        <button
          autoFocus
          className={estilos.secundario}
          disabled={procesando}
          onClick={onCancelar}
          type="button"
        >
          {textoCancelar}
        </button>
        <button
          aria-describedby={error ? errorId : undefined}
          className={
            variante === "peligro" ? estilos.peligro : estilos.confirmar
          }
          disabled={procesando}
          onClick={() => void onConfirmar()}
          type="button"
        >
          {procesando ? "Procesando…" : textoConfirmar}
        </button>
      </div>
    </dialog>
  );
}
