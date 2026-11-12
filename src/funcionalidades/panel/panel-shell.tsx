"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import type { PerfilActual } from "@/compartido/supabase/perfil-actual";
import { ProveedorNotificaciones } from "@/compartido/notificaciones/proveedor-notificaciones";

const secciones = [
  { href: "/panel", nombre: "Inicio", icono: "inicio" },
  { href: "/panel/ventas", nombre: "Ventas", icono: "ventas" },
  { href: "/panel/productos", nombre: "Productos", icono: "productos" },
  { href: "/panel/inventario", nombre: "Inventario", icono: "inventario" },
  { href: "/panel/clientes", nombre: "Clientes", icono: "clientes" },
  { href: "/panel/reportes", nombre: "Reportes", icono: "reportes" },
  { href: "/panel/facturacion", nombre: "Facturación", icono: "facturacion" },
  {
    href: "/panel/empresa",
    nombre: "Empresa",
    icono: "empresa",
    soloAdmin: true,
  },
  {
    href: "/panel/usuarios",
    nombre: "Usuarios",
    icono: "usuarios",
    soloAdmin: true,
  },
] as const;

const CLAVE_MENU_COMPACTO = "tomhjey:menu-compacto";
const oyentesMenu = new Set<() => void>();

function suscribirMenu(oyente: () => void) {
  oyentesMenu.add(oyente);
  window.addEventListener("storage", oyente);
  return () => {
    oyentesMenu.delete(oyente);
    window.removeEventListener("storage", oyente);
  };
}

function leerMenuCompacto() {
  try {
    return window.localStorage.getItem(CLAVE_MENU_COMPACTO) === "1";
  } catch {
    return false;
  }
}

function guardarMenuCompacto(compacto: boolean) {
  try {
    window.localStorage.setItem(CLAVE_MENU_COMPACTO, compacto ? "1" : "0");
  } catch {
    // Sin almacenamiento disponible, el menú vuelve a su ancho normal al recargar.
  }
  oyentesMenu.forEach((oyente) => oyente());
}

const CLAVE_TEMA = "tomhjey:tema";
const oyentesTema = new Set<() => void>();

function suscribirTema(oyente: () => void) {
  oyentesTema.add(oyente);
  return () => {
    oyentesTema.delete(oyente);
  };
}

function leerTemaOscuro() {
  return document.documentElement.dataset.tema === "oscuro";
}

function guardarTema(oscuro: boolean) {
  const tema = oscuro ? "oscuro" : "claro";
  document.documentElement.dataset.tema = tema;
  try {
    window.localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Sin almacenamiento, el tema elegido dura hasta recargar la página.
  }
  oyentesTema.forEach((oyente) => oyente());
}

type Propiedades = {
  children: React.ReactNode;
  perfil: Pick<PerfilActual, "nombre" | "rol">;
  vistaPrevia?: boolean;
};

export function PanelShell({
  children,
  perfil,
  vistaPrevia = false,
}: Propiedades) {
  const pathname = usePathname();
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const compacto = useSyncExternalStore(
    suscribirMenu,
    leerMenuCompacto,
    () => false,
  );
  const temaOscuro = useSyncExternalStore(
    suscribirTema,
    leerTemaOscuro,
    () => false,
  );
  const textoTema = temaOscuro ? "Modo claro" : "Modo oscuro";
  const rutaActual = vistaPrevia ? "/panel" : pathname;
  const iniciales = perfil.nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toLocaleUpperCase("es-PE");
  const rol = perfil.rol === "administrador" ? "Administración" : "Ventas";
  const visibles = secciones.filter(
    (seccion) =>
      !(
        "soloAdmin" in seccion &&
        seccion.soloAdmin &&
        perfil.rol !== "administrador"
      ),
  );

  useEffect(() => {
    if (!menuMovilAbierto) return;

    function cerrarConEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") setMenuMovilAbierto(false);
    }

    window.addEventListener("keydown", cerrarConEscape);
    return () => window.removeEventListener("keydown", cerrarConEscape);
  }, [menuMovilAbierto]);

  async function cerrarSesion() {
    if (vistaPrevia) {
      router.push("/acceso");
      return;
    }

    setSaliendo(true);
    const supabase = crearClienteSupabase();
    await supabase.auth.signOut();
    router.replace("/acceso");
    router.refresh();
  }

  return (
    <ProveedorNotificaciones>
      <div
        className="panel"
        data-menu={compacto ? "compacto" : "amplio"}
        data-menu-movil={menuMovilAbierto ? "abierto" : "cerrado"}
      >
        <aside
          aria-label="Navegación de la empresa"
          className="menu-lateral"
          id="menu-lateral"
        >
          <div className="menu-lateral__cabecera">
            <Link
              aria-label="Tomhjey, inicio"
              className="marca"
              href="/panel"
              onClick={() => setMenuMovilAbierto(false)}
            >
              <span aria-hidden="true" className="marca__simbolo">
                T
              </span>
              <span className="marca__nombre">Tomhjey</span>
            </Link>
            <button
              aria-controls="menu-lateral"
              aria-expanded={!compacto}
              aria-label={compacto ? "Mostrar menú" : "Esconder menú"}
              className="menu-lateral__alternar"
              onClick={() => guardarMenuCompacto(!compacto)}
              title={compacto ? "Mostrar menú" : "Esconder menú"}
              type="button"
            >
              <Icono nombre="alternar" />
            </button>
            <button
              aria-label="Cerrar menú"
              className="menu-lateral__cerrar"
              onClick={() => setMenuMovilAbierto(false)}
              type="button"
            >
              <Icono nombre="cerrar" />
            </button>
          </div>

          <nav className="nav-panel">
            {visibles.map((seccion) => {
              const activa =
                seccion.href === "/panel"
                  ? rutaActual === seccion.href
                  : rutaActual === seccion.href ||
                    rutaActual.startsWith(`${seccion.href}/`);

              return (
                <Link
                  aria-current={activa ? "page" : undefined}
                  href={seccion.href}
                  key={seccion.href}
                  onClick={() => setMenuMovilAbierto(false)}
                  title={compacto ? seccion.nombre : undefined}
                >
                  <span aria-hidden="true" className="nav-panel__icono">
                    <Icono nombre={seccion.icono} />
                  </span>
                  <span className="nav-panel__texto">{seccion.nombre}</span>
                </Link>
              );
            })}
          </nav>

          <div className="menu-lateral__pie">
            {vistaPrevia ? (
              <span className="etiqueta-vista-previa">Vista previa</span>
            ) : null}
            <div
              className="usuario-panel"
              title={compacto ? `${perfil.nombre} · ${rol}` : undefined}
            >
              <span aria-hidden="true" className="usuario-panel__avatar">
                {iniciales || "T"}
              </span>
              <div className="usuario-panel__datos">
                <strong>{perfil.nombre}</strong>
                <span>{rol}</span>
              </div>
            </div>
            <button
              aria-pressed={temaOscuro}
              className="boton-salir"
              onClick={() => guardarTema(!temaOscuro)}
              title={compacto ? textoTema : undefined}
              type="button"
            >
              <span aria-hidden="true" className="nav-panel__icono">
                <Icono nombre={temaOscuro ? "sol" : "luna"} />
              </span>
              <span className="nav-panel__texto">{textoTema}</span>
            </button>
            <button
              className="boton-salir"
              disabled={saliendo}
              onClick={cerrarSesion}
              title={compacto ? "Salir" : undefined}
              type="button"
            >
              <span aria-hidden="true" className="nav-panel__icono">
                <Icono nombre="salir" />
              </span>
              <span className="nav-panel__texto">
                {saliendo ? "Saliendo…" : "Salir"}
              </span>
            </button>
          </div>
        </aside>

        <div
          aria-hidden="true"
          className="panel__velo"
          onClick={() => setMenuMovilAbierto(false)}
        />

        <div className="panel__principal">
          <header className="barra-movil">
            <button
              aria-controls="menu-lateral"
              aria-expanded={menuMovilAbierto}
              aria-label="Abrir menú"
              className="barra-movil__boton"
              onClick={() => setMenuMovilAbierto(true)}
              type="button"
            >
              <Icono nombre="menu" />
            </button>
            <Link className="marca" href="/panel" tabIndex={-1}>
              <span aria-hidden="true" className="marca__simbolo">
                T
              </span>
              <span className="marca__nombre">Tomhjey</span>
            </Link>
            <span aria-hidden="true" className="usuario-panel__avatar">
              {iniciales || "T"}
            </span>
          </header>

          <main className="contenido-panel">{children}</main>
        </div>
      </div>
    </ProveedorNotificaciones>
  );
}

function Icono({ nombre }: { nombre: string }) {
  const comunes = {
    fill: "none",
    height: 18,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.65,
    viewBox: "0 0 24 24",
    width: 18,
  };

  const trazos: Record<string, React.ReactNode> = {
    inicio: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9M9 20v-7h6v7" />
      </>
    ),
    ventas: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M8 9h8M8 13h5M8 17h3" />
      </>
    ),
    productos: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="m4.5 7.5 7.5 4 7.5-4M12 12v9" />
      </>
    ),
    inventario: (
      <>
        <path d="M4 5h16v15H4z" />
        <path d="M8 5V3h8v2M8 10h8M8 14h8" />
      </>
    ),
    clientes: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20v-1.5A5.5 5.5 0 0 1 9 13h1M16 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM13 20h7m-3.5-3.5v7" />
      </>
    ),
    facturacion: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    reportes: (
      <>
        <path d="M4 19V5m0 14h17" />
        <path d="m7 15 4-4 3 2 5-6" />
      </>
    ),
    empresa: (
      <>
        <path d="M4 21V6l8-3v18M4 21h16V9l-8-3" />
        <path d="M8 8v1m0 3v1m0 3v1m8-4v1m0 3v1" />
      </>
    ),
    usuarios: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-1.5A5.5 5.5 0 0 1 8.5 13h1A5.5 5.5 0 0 1 15 18.5V20M16 5.2a3 3 0 0 1 0 5.6M18 14a5.5 5.5 0 0 1 3 4.5V20" />
      </>
    ),
    alternar: (
      <>
        <rect height="16" rx="2.5" width="18" x="3" y="4" />
        <path d="M9 4v16" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    luna: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
    sol: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    cerrar: <path d="m6 6 12 12M18 6 6 18" />,
    salir: (
      <>
        <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
        <path d="M10 16l-4-4 4-4M6 12h10" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" {...comunes}>
      {trazos[nombre]}
    </svg>
  );
}
