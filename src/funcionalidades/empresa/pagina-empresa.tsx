"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import { useNotificaciones } from "@/compartido/notificaciones/proveedor-notificaciones";
import type { DatosEmpresa } from "./consultas";

export function PaginaEmpresa({
  empresa,
  errorInicial,
}: {
  empresa: DatosEmpresa | null;
  errorInicial: string | null;
}) {
  const router = useRouter();
  const notificaciones = useNotificaciones();
  const [formulario, setFormulario] = useState<DatosEmpresa>(
    empresa ?? {
      nombre: "Tomhjey",
      ruc: "",
      direccion: "",
      telefono: "",
      correo: "",
      moneda: "PEN",
      igvActivo: true,
      igvPorcentaje: "18",
      preciosIncluyenIgv: true,
    },
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(errorInicial);

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    const tasa = Number(formulario.igvPorcentaje);
    if (
      !formulario.nombre.trim() ||
      !Number.isFinite(tasa) ||
      tasa < 0 ||
      tasa > 100
    ) {
      setError("Revisa el nombre, RUC, moneda y tasa de IGV.");
      return;
    }
    setGuardando(true);
    const { error: errorGuardar } = await crearClienteSupabase().rpc(
      "guardar_empresa",
      {
        nombre_empresa: formulario.nombre.trim(),
        ruc_empresa: formulario.ruc.trim() || null,
        direccion_empresa: formulario.direccion.trim() || null,
        telefono_empresa: formulario.telefono.trim() || null,
        correo_empresa: formulario.correo.trim().toLowerCase() || null,
        moneda_empresa: formulario.moneda,
        igv_habilitado: formulario.igvActivo,
        tasa_igv: tasa,
        precios_con_igv: formulario.preciosIncluyenIgv,
      },
    );
    setGuardando(false);
    if (errorGuardar) {
      if (errorGuardar.message.includes("RUC")) {
        setError(
          "El RUC no es válido. Revisa sus once dígitos y el dígito verificador.",
        );
      } else {
        notificaciones.error(
          "No se pudo guardar la configuración. Revisa los datos e inténtalo de nuevo.",
        );
      }
      return;
    }
    notificaciones.exito("La configuración de empresa se guardó.");
    router.refresh();
  }

  function actualizar<K extends keyof DatosEmpresa>(
    campo: K,
    valor: DatosEmpresa[K],
  ) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  return (
    <section className="modulo-operativo">
      <header className="encabezado-seccion">
        <div>
          <p className="rotulo">DATOS COMERCIALES Y FISCALES</p>
          <h1>Empresa y configuración</h1>
          <p className="encabezado-seccion__texto">
            Estos datos se usan en las ventas y comprobantes electrónicos.
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
      <form
        className="modulo-operativo__panel modulo-operativo__formulario"
        onSubmit={guardar}
      >
        <Campo
          etiqueta="Nombre de la empresa"
          required
          value={formulario.nombre}
          onChange={(valor) => actualizar("nombre", valor)}
        />
        <Campo
          etiqueta="RUC"
          ayuda="Necesario para emitir facturas y boletas."
          value={formulario.ruc}
          onChange={(valor) => actualizar("ruc", valor)}
        />
        <Campo
          etiqueta="Dirección fiscal"
          value={formulario.direccion}
          onChange={(valor) => actualizar("direccion", valor)}
        />
        <Campo
          etiqueta="Teléfono"
          value={formulario.telefono}
          onChange={(valor) => actualizar("telefono", valor)}
        />
        <Campo
          etiqueta="Correo electrónico"
          tipo="email"
          value={formulario.correo}
          onChange={(valor) => actualizar("correo", valor)}
        />
        <label className="campo">
          <span>Moneda de operación</span>
          <select
            onChange={(evento) =>
              actualizar("moneda", evento.target.value as "PEN" | "USD")
            }
            value={formulario.moneda}
          >
            <option value="PEN">Sol peruano (PEN)</option>
            <option value="USD">Dólar estadounidense (USD)</option>
          </select>
        </label>
        <Campo
          etiqueta="Tasa de IGV (%)"
          minimo="0"
          maximo="100"
          step="0.01"
          tipo="number"
          value={formulario.igvPorcentaje}
          onChange={(valor) => actualizar("igvPorcentaje", valor)}
        />
        <div className="campo">
          <span>Impuestos</span>
          <label className="modulo-operativo__check">
            <input
              checked={formulario.igvActivo}
              onChange={(evento) =>
                actualizar("igvActivo", evento.target.checked)
              }
              type="checkbox"
            />
            Aplicar IGV a las ventas
          </label>
          <label className="modulo-operativo__check">
            <input
              checked={formulario.preciosIncluyenIgv}
              onChange={(evento) =>
                actualizar("preciosIncluyenIgv", evento.target.checked)
              }
              type="checkbox"
            />
            Los precios del catálogo incluyen IGV
          </label>
        </div>
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
            {guardando ? "Guardando…" : "Guardar empresa"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Campo({
  etiqueta,
  value,
  onChange,
  required = false,
  tipo = "text",
  ayuda,
  minimo,
  maximo,
  step,
}: {
  etiqueta: string;
  value: string;
  onChange: (valor: string) => void;
  required?: boolean;
  tipo?: "text" | "email" | "number";
  ayuda?: string;
  minimo?: string;
  maximo?: string;
  step?: string;
}) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      <input
        max={maximo}
        min={minimo}
        onChange={(evento) => onChange(evento.target.value)}
        required={required}
        step={step}
        type={tipo}
        value={value}
      />
      {ayuda ? <small>{ayuda}</small> : null}
    </label>
  );
}
