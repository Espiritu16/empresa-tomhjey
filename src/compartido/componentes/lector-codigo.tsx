"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type {
  BarcodeDetector as DetectorCodigos,
  BarcodeFormat,
} from "barcode-detector/ponyfill";
import { DialogoModal } from "./dialogo-modal";

const FORMATOS: BarcodeFormat[] = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
];
const PAUSA_ENTRE_LECTURAS_MS = 150;

type ConstructorDetector = new (opciones: {
  formats: BarcodeFormat[];
}) => DetectorCodigos;

/**
 * Usa el lector nativo del navegador (Chrome en Android) y, si no existe
 * o no soporta los formatos de tienda (Safari en iPhone), carga ZXing.
 */
async function crearDetector(): Promise<DetectorCodigos> {
  const nativo = (globalThis as { BarcodeDetector?: unknown })
    .BarcodeDetector as
    | (ConstructorDetector & {
        getSupportedFormats(): Promise<BarcodeFormat[]>;
      })
    | undefined;
  if (nativo) {
    try {
      const soportados = await nativo.getSupportedFormats();
      if (FORMATOS.every((formato) => soportados.includes(formato))) {
        return new nativo({ formats: FORMATOS });
      }
    } catch {
      // Si el lector nativo falla, se usa la alternativa con ZXing.
    }
  }
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: FORMATOS });
}

function mensajeErrorCamara(error: unknown) {
  const nombre = error instanceof DOMException ? error.name : "";
  if (nombre === "NotAllowedError" || nombre === "SecurityError") {
    return "El navegador no tiene permiso para usar la cámara. Actívalo en la configuración del sitio y vuelve a intentarlo.";
  }
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
    return "No se encontró una cámara en este dispositivo. Escribe el código abajo.";
  }
  if (nombre === "NotReadableError") {
    return "Otra aplicación está usando la cámara. Ciérrala y vuelve a intentarlo.";
  }
  return "No se pudo iniciar la cámara. Escribe el código abajo.";
}

type Propiedades = {
  /** Texto del botón y del título de la ventana. */
  etiqueta?: string;
  /** Se llama con el código leído o escrito, sin espacios. */
  onLeido: (codigo: string) => void;
  deshabilitado?: boolean;
};

export function BotonLectorCodigo({
  etiqueta = "Escanear código de barras",
  onLeido,
  deshabilitado = false,
}: Propiedades) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        aria-label={etiqueta}
        className="boton-lector"
        disabled={deshabilitado}
        onClick={() => setAbierto(true)}
        title={etiqueta}
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="20"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
          viewBox="0 0 24 24"
          width="20"
        >
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
          <path d="M8 8v8M11 8v8M14 8v8M17 8v8" />
        </svg>
      </button>
      {/* El lector puede abrirse desde otro formulario: se monta en <body>
          para no anidar formularios. */}
      {abierto
        ? createPortal(
            <DialogoModal
              abierto
              onCerrar={() => setAbierto(false)}
              titulo={etiqueta}
            >
              <LectorCamara
                onCerrar={() => setAbierto(false)}
                onLeido={(codigo) => {
                  setAbierto(false);
                  onLeido(codigo);
                }}
              />
            </DialogoModal>,
            document.body,
          )
        : null}
    </>
  );
}

function LectorCamara({
  onLeido,
  onCerrar,
}: {
  onLeido: (codigo: string) => void;
  onCerrar: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const alLeer = useRef(onLeido);
  const [estado, setEstado] = useState<"iniciando" | "leyendo" | "error">(
    "iniciando",
  );
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    alLeer.current = onLeido;
  }, [onLeido]);

  useEffect(() => {
    let activo = true;
    let flujo: MediaStream | null = null;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    async function iniciar() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setEstado("error");
        setError(
          "La cámara solo funciona cuando la página se abre con https. Escribe el código abajo.",
        );
        return;
      }
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (!activo || !video.current) return;
        video.current.srcObject = flujo;
        await video.current.play();
        const detector = await crearDetector();
        if (!activo) return;
        setEstado("leyendo");

        const leer = async () => {
          if (!activo || !video.current) return;
          try {
            if (video.current.readyState >= 2) {
              const resultados = await detector.detect(video.current);
              const codigo = resultados[0]?.rawValue?.trim();
              if (codigo && activo) {
                activo = false;
                navigator.vibrate?.(80);
                alLeer.current(codigo);
                return;
              }
            }
          } catch {
            // Un cuadro ilegible no detiene la lectura.
          }
          temporizador = setTimeout(leer, PAUSA_ENTRE_LECTURAS_MS);
        };
        void leer();
      } catch (errorCamara) {
        if (!activo) return;
        setEstado("error");
        setError(mensajeErrorCamara(errorCamara));
      }
    }

    void iniciar();

    return () => {
      activo = false;
      clearTimeout(temporizador);
      flujo?.getTracks().forEach((pista) => pista.stop());
    };
  }, []);

  function usarCodigoEscrito(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    evento.stopPropagation();
    const codigo = manual.trim();
    if (codigo) onLeido(codigo);
  }

  return (
    <div className="lector-codigo">
      <div className="lector-codigo__visor">
        <video muted playsInline ref={video} />
        {estado === "leyendo" ? (
          <span aria-hidden="true" className="lector-codigo__guia" />
        ) : null}
        {estado === "iniciando" ? (
          <p className="lector-codigo__estado">Abriendo la cámara…</p>
        ) : null}
      </div>
      <p aria-live="polite" className="lector-codigo__ayuda">
        {estado === "error"
          ? error
          : "Apunta la cámara trasera al código de barras. Se leerá solo."}
      </p>
      <form className="lector-codigo__manual" onSubmit={usarCodigoEscrito}>
        <label className="campo">
          <span>O escribe el código</span>
          <input
            autoComplete="off"
            inputMode="numeric"
            onChange={(evento) => setManual(evento.target.value)}
            value={manual}
          />
        </label>
        <div className="lector-codigo__acciones">
          <button
            className="modulo-operativo__boton-secundario"
            onClick={onCerrar}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="boton-principal"
            disabled={!manual.trim()}
            type="submit"
          >
            Usar código
          </button>
        </div>
      </form>
    </div>
  );
}
