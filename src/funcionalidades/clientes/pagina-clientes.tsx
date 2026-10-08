"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import type { Cliente, VentaCliente } from "./consultas";

type Propiedades = {
  clientes: Cliente[];
  ventasPorCliente: Record<string, VentaCliente[]>;
  usuarioId: string;
  errorInicial: string | null;
};

type FormularioCliente = {
  tipoDocumento: string;
  numeroDocumento: string;
  nombre: string;
  direccion: string;
  telefono: string;
  correo: string;
  notas: string;
};

const formularioVacio: FormularioCliente = {
  tipoDocumento: "sin_documento",
  numeroDocumento: "",
  nombre: "",
  direccion: "",
  telefono: "",
  correo: "",
  notas: "",
};

export function PaginaClientes({
  clientes,
  ventasPorCliente,
  usuarioId,
  errorInicial,
}: Propiedades) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [clienteEditado, setClienteEditado] = useState<Cliente | null>(null);
  const [historialCliente, setHistorialCliente] = useState<Cliente | null>(
    null,
  );
  const [formulario, setFormulario] = useState(formularioVacio);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState(errorInicial);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es-PE");
    return texto
      ? clientes.filter((cliente) =>
          [
            cliente.nombre,
            cliente.numeroDocumento ?? "",
            cliente.telefono ?? "",
            cliente.correo ?? "",
          ]
            .join(" ")
            .toLocaleLowerCase("es-PE")
            .includes(texto),
        )
      : clientes;
  }, [busqueda, clientes]);

  function abrirNuevo() {
    setClienteEditado(null);
    setFormulario(formularioVacio);
    setError(null);
    setAbierto(true);
  }

  function abrirEdicion(cliente: Cliente) {
    setClienteEditado(cliente);
    setFormulario({
      tipoDocumento: cliente.tipoDocumento,
      numeroDocumento: cliente.numeroDocumento ?? "",
      nombre: cliente.nombre,
      direccion: cliente.direccion ?? "",
      telefono: cliente.telefono ?? "",
      correo: cliente.correo ?? "",
      notas: cliente.notas ?? "",
    });
    setError(null);
    setAbierto(true);
  }

  async function guardarCliente(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setMensaje(null);
    if (
      !formulario.nombre.trim() ||
      (formulario.tipoDocumento !== "sin_documento" &&
        !formulario.numeroDocumento.trim())
    ) {
      setError("Escribe el nombre del cliente e identifica su documento.");
      return;
    }
    const datos = {
      tipo_documento: formulario.tipoDocumento,
      numero_documento:
        formulario.tipoDocumento === "sin_documento"
          ? null
          : formulario.numeroDocumento.trim(),
      nombre: formulario.nombre.trim(),
      direccion: formulario.direccion.trim() || null,
      telefono: formulario.telefono.trim() || null,
      correo: formulario.correo.trim().toLowerCase() || null,
      notas: formulario.notas.trim() || null,
    };

    setGuardando(true);
    const supabase = crearClienteSupabase();
    try {
      if (clienteEditado) {
        const { data, error: errorActualizacion } = await supabase
          .from("clientes")
          .update(datos)
          .eq("id", clienteEditado.id)
          .select("id")
          .maybeSingle();
        if (errorActualizacion) throw errorActualizacion;
        if (!data)
          throw new Error("El cliente no está disponible para editar.");
        setMensaje("Los datos del cliente se actualizaron.");
      } else {
        const { error: errorInsercion } = await supabase
          .from("clientes")
          .insert({ ...datos, creado_por: usuarioId });
        if (errorInsercion) throw errorInsercion;
        setMensaje("El cliente se agregó al directorio.");
      }
      setAbierto(false);
      router.refresh();
    } catch (errorGuardado) {
      setError(
        errorGuardado instanceof Error &&
          errorGuardado.message.includes("23505")
          ? "Ya existe un cliente con ese documento."
          : "No se pudieron guardar los datos del cliente. Revisa la información e inténtalo de nuevo.",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="modulo-operativo">
      <header className="encabezado-seccion">
        <div>
          <p className="rotulo">DIRECTORIO</p>
          <h1>Clientes</h1>
          <p className="encabezado-seccion__texto">
            Mantén a mano los datos necesarios para registrar y facturar ventas.
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
        <label className="campo">
          <span className="sr-only">Buscar clientes</span>
          <input
            aria-label="Buscar clientes"
            className="modulo-operativo__busqueda"
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar por nombre, documento o contacto"
            type="search"
            value={busqueda}
          />
        </label>
        <button className="boton-principal" onClick={abrirNuevo} type="button">
          Nuevo cliente
        </button>
      </div>

      <div className="modulo-operativo__tabla-contenedor">
        <table className="modulo-operativo__tabla">
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Documento</th>
              <th scope="col">Contacto</th>
              <th scope="col">Ventas</th>
              <th scope="col">Estado</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((cliente) => {
              const ventas = ventasPorCliente[cliente.id] ?? [];
              return (
                <tr key={cliente.id}>
                  <td>
                    <strong>{cliente.nombre}</strong>
                  </td>
                  <td>
                    {etiquetaDocumento(
                      cliente.tipoDocumento,
                      cliente.numeroDocumento,
                    )}
                  </td>
                  <td>
                    {cliente.telefono ?? cliente.correo ?? "Sin contacto"}
                  </td>
                  <td>
                    {
                      ventas.filter((venta) => venta.estado === "confirmada")
                        .length
                    }
                  </td>
                  <td>
                    <span
                      className={`modulo-operativo__estado${cliente.activo ? " modulo-operativo__estado--activo" : ""}`}
                    >
                      {cliente.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <button
                      aria-label={`Ver ventas de ${cliente.nombre}`}
                      className="modulo-operativo__boton-texto"
                      onClick={() => setHistorialCliente(cliente)}
                      type="button"
                    >
                      Historial
                    </button>
                    <button
                      aria-label={`Editar ${cliente.nombre}`}
                      className="modulo-operativo__boton-texto"
                      onClick={() => abrirEdicion(cliente)}
                      type="button"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visibles.length === 0 ? (
          <div className="modulo-operativo__vacio" role="status">
            <strong>
              {busqueda ? "No encontramos clientes" : "Aún no hay clientes"}
            </strong>
            <span>
              Agrega una persona o empresa para asociarla a sus ventas.
            </span>
          </div>
        ) : null}
      </div>

      {abierto ? (
        <div className="modulo-operativo__dialogo-fondo">
          <section
            aria-labelledby="formulario-cliente-titulo"
            aria-modal="true"
            className="modulo-operativo__dialogo"
            role="dialog"
          >
            <h2 id="formulario-cliente-titulo">
              {clienteEditado ? "Editar cliente" : "Nuevo cliente"}
            </h2>
            <form
              className="modulo-operativo__formulario"
              onSubmit={guardarCliente}
            >
              <label className="campo">
                <span>Tipo de documento</span>
                <select
                  onChange={(evento) =>
                    setFormulario((actual) => ({
                      ...actual,
                      tipoDocumento: evento.target.value,
                    }))
                  }
                  value={formulario.tipoDocumento}
                >
                  <option value="sin_documento">Sin documento</option>
                  <option value="dni">DNI</option>
                  <option value="ruc">RUC</option>
                  <option value="ce">Carné de extranjería</option>
                  <option value="pasaporte">Pasaporte</option>
                </select>
              </label>
              <label className="campo">
                <span>Número de documento</span>
                <input
                  disabled={formulario.tipoDocumento === "sin_documento"}
                  onChange={(evento) =>
                    setFormulario((actual) => ({
                      ...actual,
                      numeroDocumento: evento.target.value,
                    }))
                  }
                  required={formulario.tipoDocumento !== "sin_documento"}
                  value={formulario.numeroDocumento}
                />
              </label>
              <Campo
                etiqueta="Nombre del cliente"
                required
                value={formulario.nombre}
                onChange={(nombre) =>
                  setFormulario((actual) => ({ ...actual, nombre }))
                }
              />
              <Campo
                etiqueta="Teléfono"
                value={formulario.telefono}
                onChange={(telefono) =>
                  setFormulario((actual) => ({ ...actual, telefono }))
                }
              />
              <Campo
                etiqueta="Correo electrónico"
                tipo="email"
                value={formulario.correo}
                onChange={(correo) =>
                  setFormulario((actual) => ({ ...actual, correo }))
                }
              />
              <Campo
                etiqueta="Dirección"
                value={formulario.direccion}
                onChange={(direccion) =>
                  setFormulario((actual) => ({ ...actual, direccion }))
                }
              />
              <label className="campo modulo-operativo__ancho-completo">
                <span>Notas</span>
                <textarea
                  onChange={(evento) =>
                    setFormulario((actual) => ({
                      ...actual,
                      notas: evento.target.value,
                    }))
                  }
                  value={formulario.notas}
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
                  {guardando
                    ? "Guardando…"
                    : clienteEditado
                      ? "Guardar cambios"
                      : "Guardar cliente"}
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

      {historialCliente ? (
        <div className="modulo-operativo__dialogo-fondo">
          <section
            aria-labelledby="historial-cliente-titulo"
            aria-modal="true"
            className="modulo-operativo__dialogo"
            role="dialog"
          >
            <h2 id="historial-cliente-titulo">Historial del cliente</h2>
            <p>{historialCliente.nombre}</p>
            {(ventasPorCliente[historialCliente.id] ?? []).length ? (
              <div className="modulo-operativo__tabla-contenedor">
                <table className="modulo-operativo__tabla">
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ventasPorCliente[historialCliente.id] ?? []).map(
                      (venta) => (
                        <tr key={venta.id}>
                          <td>
                            {formatearFecha(
                              venta.confirmadoEn ?? venta.creadoEn,
                            )}
                          </td>
                          <td>
                            {venta.estado === "confirmada"
                              ? "Confirmada"
                              : venta.estado === "borrador"
                                ? "Borrador"
                                : "Descartada"}
                          </td>
                          <td>{formatearImporte(venta.total, venta.moneda)}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="modulo-operativo__vacio">
                Aún no hay ventas para este cliente.
              </p>
            )}
            <div className="modulo-operativo__acciones">
              <button
                className="modulo-operativo__boton-secundario"
                onClick={() => setHistorialCliente(null)}
                type="button"
              >
                Cerrar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function Campo({
  etiqueta,
  value,
  onChange,
  required = false,
  tipo = "text",
}: {
  etiqueta: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  tipo?: "text" | "email";
}) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      <input
        onChange={(evento) => onChange(evento.target.value)}
        required={required}
        type={tipo}
        value={value}
      />
    </label>
  );
}

function etiquetaDocumento(tipo: string, numero: string | null): string {
  if (tipo === "sin_documento") return "Sin documento";
  const etiqueta =
    { dni: "DNI", ruc: "RUC", ce: "CE", pasaporte: "Pasaporte" }[tipo] ?? tipo;
  return `${etiqueta} ${numero ?? ""}`.trim();
}

function formatearImporte(total: number, moneda: string): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: moneda,
  }).format(total);
}

function formatearFecha(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(
    new Date(fecha),
  );
}
