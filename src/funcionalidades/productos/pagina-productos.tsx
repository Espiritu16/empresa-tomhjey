"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import { DialogoModal } from "@/compartido/componentes/dialogo-modal";
import { BotonLectorCodigo } from "@/compartido/componentes/lector-codigo";
import { useNotificaciones } from "@/compartido/notificaciones/proveedor-notificaciones";
import type { Categoria, Producto } from "./consultas";

type Propiedades = {
  productos: Producto[];
  categorias: Categoria[];
  puedeGestionarProductos: boolean;
  esAdministrador: boolean;
  usuarioId: string;
  errorInicial: string | null;
};

type FormularioProducto = {
  sku: string;
  codigoBarras: string;
  nombre: string;
  categoriaId: string;
  descripcion: string;
  unidadMedida: string;
  precio: string;
  existenciasIniciales: string;
  stockMinimo: string;
};

const FORMATO_CODIGO_BARRAS = /^[0-9A-Za-z.-]{4,64}$/;

const formularioVacio: FormularioProducto = {
  sku: "",
  codigoBarras: "",
  nombre: "",
  categoriaId: "",
  descripcion: "",
  unidadMedida: "NIU",
  precio: "",
  existenciasIniciales: "0",
  stockMinimo: "0",
};

export function PaginaProductos({
  productos,
  categorias,
  puedeGestionarProductos,
  esAdministrador,
  usuarioId,
  errorInicial,
}: Propiedades) {
  const router = useRouter();
  const notificaciones = useNotificaciones();
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [productoEditado, setProductoEditado] = useState<Producto | null>(null);
  const [formulario, setFormulario] = useState(formularioVacio);
  const [categoriaNueva, setCategoriaNueva] = useState("");
  const [crearCategoria, setCrearCategoria] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [productoActualizando, setProductoActualizando] = useState<
    string | null
  >(null);
  const [error, setError] = useState(errorInicial);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es-PE");
    if (!texto) return productos;
    return productos.filter((producto) =>
      [
        producto.sku,
        producto.codigoBarras ?? "",
        producto.nombre,
        producto.categoriaNombre ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("es-PE")
        .includes(texto),
    );
  }, [busqueda, productos]);

  function abrirNuevo() {
    setProductoEditado(null);
    setFormulario(formularioVacio);
    setError(null);
    setAbierto(true);
  }

  function abrirEdicion(producto: Producto) {
    setProductoEditado(producto);
    setFormulario({
      sku: producto.sku,
      codigoBarras: producto.codigoBarras ?? "",
      nombre: producto.nombre,
      categoriaId: producto.categoriaId ?? "",
      descripcion: producto.descripcion ?? "",
      unidadMedida: producto.unidadMedida,
      precio: producto.precio?.toString() ?? "",
      existenciasIniciales: "0",
      stockMinimo: producto.stockMinimo.toString(),
    });
    setError(null);
    setAbierto(true);
  }

  async function guardarProducto(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    const precio = Number(formulario.precio);
    const stockInicial = Number(formulario.existenciasIniciales);
    const stockMinimo = Number(formulario.stockMinimo);
    if (
      !formulario.sku.trim() ||
      !formulario.nombre.trim() ||
      !formulario.unidadMedida.trim() ||
      !Number.isFinite(precio) ||
      precio < 0 ||
      !Number.isFinite(stockInicial) ||
      stockInicial < 0 ||
      !Number.isFinite(stockMinimo) ||
      stockMinimo < 0
    ) {
      setError("Revisa el SKU, nombre, precio y existencias del producto.");
      return;
    }
    const codigoBarras = formulario.codigoBarras.trim();
    if (codigoBarras && !FORMATO_CODIGO_BARRAS.test(codigoBarras)) {
      setError(
        "El código de barras debe tener entre 4 y 64 letras o números, sin espacios.",
      );
      return;
    }
    setGuardando(true);
    const supabase = crearClienteSupabase();
    try {
      if (productoEditado) {
        const cambios = {
          sku: formulario.sku.trim(),
          codigo_barras: codigoBarras || null,
          nombre: formulario.nombre.trim(),
          categoria_id: formulario.categoriaId || null,
          descripcion: formulario.descripcion.trim() || null,
          unidad_medida: formulario.unidadMedida.trim().toUpperCase(),
          stock_minimo: stockMinimo,
          ...(!productoEditado.usaCombinaciones ? { precio } : {}),
        };
        const { data: actualizacion, error: errorActualizacion } =
          await supabase
            .from("productos")
            .update(cambios)
            .eq("id", productoEditado.id)
            .select("id")
            .maybeSingle();

        if (errorActualizacion) throw errorActualizacion;
        if (!actualizacion) {
          throw new Error(
            "No se encontró el producto o no tienes permiso para editarlo.",
          );
        }
        notificaciones.exito("Los cambios del producto se guardaron.");
      } else {
        const { data: creado, error: errorCreacion } = await supabase
          .from("productos")
          .insert({
            sku: formulario.sku.trim(),
            codigo_barras: codigoBarras || null,
            nombre: formulario.nombre.trim(),
            categoria_id: formulario.categoriaId || null,
            descripcion: formulario.descripcion.trim() || null,
            unidad_medida: formulario.unidadMedida.trim().toUpperCase(),
            precio,
            stock_minimo: stockMinimo,
            creado_por: usuarioId,
          })
          .select("id")
          .single();
        if (errorCreacion || !creado) throw errorCreacion;

        if (stockInicial > 0) {
          const { error: errorStock } = await supabase.rpc(
            "ajustar_existencias",
            {
              producto_objetivo: creado.id,
              combinacion_objetivo: null,
              cambio: stockInicial,
              razon: "Existencias iniciales",
            },
          );
          if (errorStock) {
            notificaciones.error(
              "El producto quedó creado, pero no se pudo registrar el stock inicial. Regístralo desde Inventario.",
            );
          } else {
            notificaciones.exito(
              "El producto se creó con sus existencias iniciales.",
            );
          }
        } else {
          notificaciones.exito(
            esAdministrador
              ? "El producto se creó."
              : "El producto se creó. La administración puede registrar sus existencias desde Inventario.",
          );
        }
      }

      setAbierto(false);
      router.refresh();
    } catch (errorGuardado) {
      const mensajeError =
        errorGuardado instanceof Error ? errorGuardado.message : "";
      if (mensajeError.includes("productos_codigo_barras_unico")) {
        setError(
          "Ese código de barras ya pertenece a otro producto. Revisa el código escaneado.",
        );
      } else if (mensajeError.includes("productos_codigo_barras_formato")) {
        setError(
          "El código de barras debe tener entre 4 y 64 letras o números, sin espacios.",
        );
      } else if (mensajeError.includes("duplicate key")) {
        setError("Ese SKU ya está registrado. Escribe uno distinto.");
      } else {
        notificaciones.error(
          "No se pudo guardar el producto. Revisa los datos e inténtalo de nuevo.",
        );
      }
    } finally {
      setGuardando(false);
    }
  }

  async function guardarCategoria(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    const nombre = categoriaNueva.trim();
    if (!nombre) {
      setError("Escribe el nombre de la categoría.");
      return;
    }
    setGuardando(true);
    const { data, error: errorInsercion } = await crearClienteSupabase()
      .from("categorias")
      .insert({ nombre })
      .select("id")
      .single();
    setGuardando(false);
    if (errorInsercion || !data) {
      if (errorInsercion?.code === "23505") {
        setError("Ya existe una categoría con ese nombre.");
      } else {
        notificaciones.error("No se pudo guardar la categoría.");
      }
      return;
    }
    setFormulario((actual) => ({ ...actual, categoriaId: data.id }));
    setCategoriaNueva("");
    setCrearCategoria(false);
    notificaciones.exito("La categoría se agregó al catálogo.");
    router.refresh();
  }

  async function cambiarEstado(producto: Producto) {
    setError(null);
    setProductoActualizando(producto.id);
    const { data, error: errorCambio } = await crearClienteSupabase()
      .from("productos")
      .update({ activo: !producto.activo })
      .eq("id", producto.id)
      .select("id")
      .maybeSingle();
    setProductoActualizando(null);
    if (errorCambio || !data) {
      notificaciones.error("No se pudo actualizar el estado del producto.");
      return;
    }
    notificaciones.exito(
      producto.activo
        ? "El producto se inactivó. Puedes volver a activarlo cuando quieras."
        : "El producto se activó.",
    );
    router.refresh();
  }

  return (
    <section className="modulo-operativo">
      <header className="encabezado-seccion">
        <div>
          <p className="rotulo">CATÁLOGO</p>
          <h1>Productos</h1>
          <p className="encabezado-seccion__texto">
            Consulta precios, categorías y existencias de los productos.
          </p>
        </div>
      </header>

      {error ? (
        <p
          aria-live="assertive"
          className="modulo-operativo__aviso modulo-operativo__aviso--error"
        >
          {error}
        </p>
      ) : null}

      <div className="modulo-operativo__barra">
        <div className="campo-con-lector">
          <label className="campo">
            <span className="sr-only">Buscar productos</span>
            <input
              aria-label="Buscar productos"
              className="modulo-operativo__busqueda"
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Buscar por nombre, SKU o código de barras"
              type="search"
              value={busqueda}
            />
          </label>
          <BotonLectorCodigo
            etiqueta="Buscar por código de barras"
            onLeido={setBusqueda}
          />
        </div>
        {puedeGestionarProductos ? (
          <div className="modulo-operativo__acciones">
            {esAdministrador ? (
              <button
                aria-controls="formulario-nueva-categoria"
                aria-expanded={crearCategoria}
                className="modulo-operativo__boton-secundario"
                onClick={() => setCrearCategoria((actual) => !actual)}
                type="button"
              >
                {crearCategoria ? "Cancelar categoría" : "Nueva categoría"}
              </button>
            ) : null}
            <button
              className="boton-principal"
              onClick={abrirNuevo}
              type="button"
            >
              Nuevo producto
            </button>
          </div>
        ) : null}
      </div>

      {crearCategoria && esAdministrador ? (
        <form
          id="formulario-nueva-categoria"
          className="modulo-operativo__panel modulo-operativo__acciones"
          onSubmit={guardarCategoria}
        >
          <label className="campo">
            <span>Nombre de la categoría</span>
            <input
              autoFocus
              onChange={(evento) => setCategoriaNueva(evento.target.value)}
              required
              value={categoriaNueva}
            />
          </label>
          <button
            className="boton-principal"
            disabled={guardando}
            type="submit"
          >
            Guardar categoría
          </button>
        </form>
      ) : null}

      <div className="modulo-operativo__tabla-contenedor">
        <table className="modulo-operativo__tabla">
          <thead>
            <tr>
              <th scope="col">SKU</th>
              <th scope="col">Producto</th>
              <th scope="col">Categoría</th>
              <th scope="col">Precio</th>
              <th scope="col">Existencias</th>
              <th scope="col">Estado</th>
              {puedeGestionarProductos ? <th scope="col">Acciones</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibles.map((producto) => (
              <tr key={producto.id}>
                <td>
                  {producto.sku}
                  {producto.codigoBarras ? (
                    <small className="modulo-operativo__detalle">
                      {producto.codigoBarras}
                    </small>
                  ) : null}
                </td>
                <td>
                  <strong>{producto.nombre}</strong>
                </td>
                <td>{producto.categoriaNombre ?? "Sin categoría"}</td>
                <td>
                  {producto.precio === null
                    ? "Por combinación"
                    : formatearImporte(producto.precio)}
                </td>
                <td>
                  {formatearCantidad(
                    producto.existencias,
                    producto.unidadMedida,
                  )}
                </td>
                <td>
                  <span
                    className={`modulo-operativo__estado${producto.activo ? " modulo-operativo__estado--activo" : ""}`}
                  >
                    {producto.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                {puedeGestionarProductos ? (
                  <td>
                    <button
                      aria-label={`Editar ${producto.nombre}`}
                      className="modulo-operativo__boton-texto"
                      onClick={() => abrirEdicion(producto)}
                      type="button"
                    >
                      Editar
                    </button>
                    <button
                      aria-label={`${producto.activo ? "Inactivar" : "Activar"} ${producto.nombre}`}
                      className="modulo-operativo__boton-texto"
                      disabled={productoActualizando === producto.id}
                      onClick={() => void cambiarEstado(producto)}
                      type="button"
                    >
                      {producto.activo ? "Inactivar" : "Activar"}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 ? (
          <div className="modulo-operativo__vacio" role="status">
            <strong>
              {busqueda ? "No encontramos productos" : "Aún no hay productos"}
            </strong>
            <span>
              {busqueda
                ? "Prueba con otro nombre, SKU o código de barras."
                : "Crea el primer producto para empezar a registrar ventas."}
            </span>
          </div>
        ) : null}
      </div>

      <DialogoModal
        abierto={abierto}
        bloqueado={Boolean(guardando)}
        onCerrar={() => setAbierto(false)}
        titulo={productoEditado ? "Editar producto" : "Nuevo producto"}
      >
        <form
          className="modulo-operativo__formulario"
          onSubmit={guardarProducto}
        >
          <Campo
            etiqueta="Nombre del producto"
            required
            value={formulario.nombre}
            onChange={(nombre) =>
              setFormulario((actual) => ({ ...actual, nombre }))
            }
          />
          <Campo
            etiqueta="SKU"
            required
            value={formulario.sku}
            onChange={(sku) => setFormulario((actual) => ({ ...actual, sku }))}
          />
          <div className="campo">
            <label htmlFor="codigo-barras-producto">Código de barras</label>
            <div className="campo-con-lector">
              <input
                autoComplete="off"
                id="codigo-barras-producto"
                inputMode="numeric"
                onChange={(evento) =>
                  setFormulario((actual) => ({
                    ...actual,
                    codigoBarras: evento.target.value,
                  }))
                }
                onKeyDown={(evento) => {
                  // La pistola lectora termina con Enter: no debe enviar el formulario.
                  if (evento.key === "Enter") evento.preventDefault();
                }}
                placeholder="Opcional"
                value={formulario.codigoBarras}
              />
              <BotonLectorCodigo
                etiqueta="Escanear código del producto"
                onLeido={(codigoBarras) =>
                  setFormulario((actual) => ({ ...actual, codigoBarras }))
                }
              />
            </div>
          </div>
          <label className="campo">
            <span>Categoría</span>
            <select
              onChange={(evento) =>
                setFormulario((actual) => ({
                  ...actual,
                  categoriaId: evento.target.value,
                }))
              }
              value={formulario.categoriaId}
            >
              <option value="">Sin categoría</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Unidad de medida</span>
            <select
              onChange={(evento) =>
                setFormulario((actual) => ({
                  ...actual,
                  unidadMedida: evento.target.value,
                }))
              }
              value={formulario.unidadMedida}
            >
              <option value="NIU">Unidad</option>
              <option value="MTR">Metro</option>
              <option value="KGM">Kilogramo</option>
              <option value="DZN">Docena</option>
            </select>
          </label>
          {!productoEditado?.usaCombinaciones ? (
            <Campo
              etiqueta="Precio unitario"
              minimo="0"
              step="0.01"
              tipo="number"
              required
              value={formulario.precio}
              onChange={(precio) =>
                setFormulario((actual) => ({ ...actual, precio }))
              }
            />
          ) : null}
          {!productoEditado && esAdministrador ? (
            <Campo
              etiqueta="Existencias iniciales"
              minimo="0"
              step="0.001"
              tipo="number"
              value={formulario.existenciasIniciales}
              onChange={(existenciasIniciales) =>
                setFormulario((actual) => ({
                  ...actual,
                  existenciasIniciales,
                }))
              }
            />
          ) : null}
          <Campo
            etiqueta="Stock mínimo"
            minimo="0"
            step="0.001"
            tipo="number"
            value={formulario.stockMinimo}
            onChange={(stockMinimo) =>
              setFormulario((actual) => ({ ...actual, stockMinimo }))
            }
          />
          <label className="campo modulo-operativo__ancho-completo">
            <span>Descripción</span>
            <textarea
              onChange={(evento) =>
                setFormulario((actual) => ({
                  ...actual,
                  descripcion: evento.target.value,
                }))
              }
              value={formulario.descripcion}
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
              {guardando
                ? "Guardando…"
                : productoEditado
                  ? "Guardar cambios"
                  : "Guardar producto"}
            </button>
          </div>
        </form>
      </DialogoModal>
    </section>
  );
}

function Campo({
  etiqueta,
  value,
  onChange,
  required = false,
  tipo = "text",
  minimo,
  step,
}: {
  etiqueta: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  tipo?: "text" | "number";
  minimo?: string;
  step?: string;
}) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      <input
        min={minimo}
        onChange={(evento) => onChange(evento.target.value)}
        required={required}
        step={step}
        type={tipo}
        value={value}
      />
    </label>
  );
}

function formatearImporte(importe: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(importe);
}

function formatearCantidad(cantidad: number, unidad: string): string {
  return `${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 3 }).format(cantidad)} ${unidad}`;
}
