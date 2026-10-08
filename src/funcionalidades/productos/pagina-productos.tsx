"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import type { Categoria, Producto } from "./consultas";

type Propiedades = {
  productos: Producto[];
  categorias: Categoria[];
  puedeEditar: boolean;
  usuarioId: string;
  errorInicial: string | null;
};

type FormularioProducto = {
  sku: string;
  nombre: string;
  categoriaId: string;
  descripcion: string;
  unidadMedida: string;
  precio: string;
  existenciasIniciales: string;
  stockMinimo: string;
};

const formularioVacio: FormularioProducto = {
  sku: "",
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
  puedeEditar,
  usuarioId,
  errorInicial,
}: Propiedades) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [productoEditado, setProductoEditado] = useState<Producto | null>(null);
  const [formulario, setFormulario] = useState(formularioVacio);
  const [categoriaNueva, setCategoriaNueva] = useState("");
  const [crearCategoria, setCrearCategoria] = useState(false);
  const [usaCombinaciones, setUsaCombinaciones] = useState(false);
  const [nombreOpcion1, setNombreOpcion1] = useState("Talla");
  const [valoresOpcion1, setValoresOpcion1] = useState("");
  const [nombreOpcion2, setNombreOpcion2] = useState("Color");
  const [valoresOpcion2, setValoresOpcion2] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState(errorInicial);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es-PE");
    if (!texto) return productos;
    return productos.filter((producto) =>
      [producto.sku, producto.nombre, producto.categoriaNombre ?? ""]
        .join(" ")
        .toLocaleLowerCase("es-PE")
        .includes(texto),
    );
  }, [busqueda, productos]);

  function abrirNuevo() {
    setProductoEditado(null);
    setFormulario(formularioVacio);
    setUsaCombinaciones(false);
    setNombreOpcion1("Talla");
    setValoresOpcion1("");
    setNombreOpcion2("Color");
    setValoresOpcion2("");
    setError(null);
    setAbierto(true);
  }

  function abrirEdicion(producto: Producto) {
    setProductoEditado(producto);
    setFormulario({
      sku: producto.sku,
      nombre: producto.nombre,
      categoriaId: producto.categoriaId ?? "",
      descripcion: producto.descripcion ?? "",
      unidadMedida: producto.unidadMedida,
      precio: producto.precio?.toString() ?? "",
      existenciasIniciales: "0",
      stockMinimo: producto.stockMinimo.toString(),
    });
    setUsaCombinaciones(producto.usaCombinaciones);
    setError(null);
    setAbierto(true);
  }

  async function guardarProducto(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setMensaje(null);
    const precio = Number(formulario.precio);
    const stockInicial = Number(formulario.existenciasIniciales);
    const stockMinimo = Number(formulario.stockMinimo);
    const opciones = [
      { nombre: nombreOpcion1.trim(), valores: separarValores(valoresOpcion1) },
      { nombre: nombreOpcion2.trim(), valores: separarValores(valoresOpcion2) },
    ].filter((opcion, indice) => indice === 0 || opcion.valores.length > 0);
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
    if (
      usaCombinaciones &&
      !productoEditado &&
      opciones.some((opcion) => !opcion.nombre || opcion.valores.length === 0)
    ) {
      setError(
        "Cada combinación necesita un nombre de opción y al menos un valor separado por comas.",
      );
      return;
    }

    setGuardando(true);
    const supabase = crearClienteSupabase();
    try {
      if (productoEditado) {
        const cambios = {
          sku: formulario.sku.trim(),
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
        setMensaje("Los cambios del producto se guardaron.");
      } else {
        if (usaCombinaciones) {
          const { error: errorCombinaciones } = await supabase.rpc(
            "crear_producto_con_combinaciones",
            {
              sku_producto: formulario.sku.trim(),
              nombre_producto: formulario.nombre.trim(),
              categoria_objetivo: formulario.categoriaId || null,
              unidad: formulario.unidadMedida.trim().toUpperCase(),
              precio_base: precio,
              minimo_stock: stockMinimo,
              opciones,
            },
          );
          if (errorCombinaciones) throw errorCombinaciones;
          setMensaje(
            "El producto y sus combinaciones se crearon. Registra las existencias desde Inventario.",
          );
          setAbierto(false);
          router.refresh();
          return;
        }
        const { data: creado, error: errorCreacion } = await supabase
          .from("productos")
          .insert({
            sku: formulario.sku.trim(),
            nombre: formulario.nombre.trim(),
            categoria_id: formulario.categoriaId || null,
            descripcion: formulario.descripcion.trim() || null,
            unidad_medida: formulario.unidadMedida.trim().toUpperCase(),
            usa_combinaciones: false,
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
            setMensaje(
              "El producto quedó creado, pero no se pudo registrar el stock inicial. Regístralo desde Inventario.",
            );
          } else {
            setMensaje("El producto se creó con sus existencias iniciales.");
          }
        } else {
          setMensaje("El producto se creó.");
        }
      }

      setAbierto(false);
      router.refresh();
    } catch (errorGuardado) {
      const mensajeError =
        errorGuardado instanceof Error ? errorGuardado.message : "";
      setError(
        mensajeError.includes("duplicate key")
          ? "Ese SKU ya está registrado. Escribe uno distinto."
          : "No se pudo guardar el producto. Revisa los datos e inténtalo de nuevo.",
      );
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
      setError(
        errorInsercion?.code === "23505"
          ? "Ya existe una categoría con ese nombre."
          : "No se pudo guardar la categoría.",
      );
      return;
    }
    setFormulario((actual) => ({ ...actual, categoriaId: data.id }));
    setCategoriaNueva("");
    setCrearCategoria(false);
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
          <span className="sr-only">Buscar productos</span>
          <input
            aria-label="Buscar productos"
            className="modulo-operativo__busqueda"
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar por nombre, SKU o categoría"
            type="search"
            value={busqueda}
          />
        </label>
        {puedeEditar ? (
          <div className="modulo-operativo__acciones">
            <button
              className="modulo-operativo__boton-secundario"
              onClick={() => setCrearCategoria((actual) => !actual)}
              type="button"
            >
              Nueva categoría
            </button>
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

      {crearCategoria && puedeEditar ? (
        <form
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
              {puedeEditar ? <th scope="col">Acciones</th> : null}
            </tr>
          </thead>
          <tbody>
            {visibles.map((producto) => (
              <tr key={producto.id}>
                <td>{producto.sku}</td>
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
                {puedeEditar ? (
                  <td>
                    <button
                      aria-label={`Editar ${producto.nombre}`}
                      className="modulo-operativo__boton-texto"
                      onClick={() => abrirEdicion(producto)}
                      type="button"
                    >
                      Editar
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
                ? "Prueba con otro nombre, SKU o categoría."
                : "Crea el primer producto para empezar a registrar ventas."}
            </span>
          </div>
        ) : null}
      </div>

      {abierto ? (
        <div className="modulo-operativo__dialogo-fondo">
          <section
            aria-labelledby="formulario-producto-titulo"
            aria-modal="true"
            className="modulo-operativo__dialogo"
            role="dialog"
          >
            <h2 id="formulario-producto-titulo">
              {productoEditado ? "Editar producto" : "Nuevo producto"}
            </h2>
            <form
              className="modulo-operativo__formulario"
              onSubmit={guardarProducto}
            >
              <Campo
                etiqueta="SKU"
                required
                value={formulario.sku}
                onChange={(sku) =>
                  setFormulario((actual) => ({ ...actual, sku }))
                }
              />
              <Campo
                etiqueta="Nombre del producto"
                required
                value={formulario.nombre}
                onChange={(nombre) =>
                  setFormulario((actual) => ({ ...actual, nombre }))
                }
              />
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
              {!productoEditado ? (
                <label className="campo modulo-operativo__ancho-completo">
                  <input
                    checked={usaCombinaciones}
                    onChange={(evento) =>
                      setUsaCombinaciones(evento.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>
                    Este producto tiene tallas, colores u otras combinaciones
                  </span>
                </label>
              ) : null}
              {!productoEditado?.usaCombinaciones ? (
                <Campo
                  etiqueta={
                    usaCombinaciones
                      ? "Precio base por combinación"
                      : "Precio unitario"
                  }
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
              {usaCombinaciones && !productoEditado ? (
                <>
                  <Campo
                    etiqueta="Nombre de la primera opción"
                    required
                    value={nombreOpcion1}
                    onChange={setNombreOpcion1}
                  />
                  <Campo
                    etiqueta="Valores de la primera opción"
                    required
                    value={valoresOpcion1}
                    onChange={setValoresOpcion1}
                  />
                  <Campo
                    etiqueta="Nombre de la segunda opción"
                    value={nombreOpcion2}
                    onChange={setNombreOpcion2}
                  />
                  <Campo
                    etiqueta="Valores de la segunda opción"
                    value={valoresOpcion2}
                    onChange={setValoresOpcion2}
                  />
                  <p className="modulo-operativo__nota modulo-operativo__ancho-completo">
                    Separa los valores con comas. Por ejemplo: Talla: S, M, L y
                    Color: Negro, Blanco. Cada combinación inicia sin
                    existencias; agrégalas en Inventario.
                  </p>
                </>
              ) : null}
              {!productoEditado && !usaCombinaciones ? (
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
              <div className="modulo-operativo__acciones modulo-operativo__ancho-completo">
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

function separarValores(texto: string): string[] {
  return [
    ...new Set(
      texto
        .split(",")
        .map((valor) => valor.trim())
        .filter(Boolean),
    ),
  ];
}
