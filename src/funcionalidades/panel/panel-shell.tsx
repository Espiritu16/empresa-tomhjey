"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { crearClienteSupabase } from "@/compartido/supabase/cliente";
import type { PerfilActual } from "@/compartido/supabase/perfil-actual";

const secciones = [
  { href: "/panel", nombre: "Inicio", icono: "inicio" },
  { href: "/panel/ventas", nombre: "Ventas", icono: "ventas" },
  { href: "/panel/productos", nombre: "Productos", icono: "productos" },
  { href: "/panel/inventario", nombre: "Inventario", icono: "inventario" },
  { href: "/panel/clientes", nombre: "Clientes", icono: "clientes" },
  { href: "/panel/reportes", nombre: "Reportes", icono: "reportes" },
  { href: "/panel/facturacion", nombre: "Facturación", icono: "facturacion" },
  { href: "/panel/asistente", nombre: "Asistente IA", icono: "asistente" },
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
  const rutaActual = vistaPrevia ? "/panel" : pathname;
  const iniciales = perfil.nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toLocaleUpperCase("es-PE");
  const visibles = secciones.filter(
    (seccion) =>
      !(
        "soloAdmin" in seccion &&
        seccion.soloAdmin &&
        perfil.rol !== "administrador"
      ),
  );

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
    <>
      <header className="cabecera-panel">
        <div className="cabecera-panel__contenido">
          <Link aria-label="Tomhjey, inicio" className="marca" href="/panel">
            <span aria-hidden="true" className="marca__punto" />
            <span>Tomhjey</span>
          </Link>

          <div className="cabecera-panel__derecha">
            {vistaPrevia ? (
              <span className="etiqueta-vista-previa">Vista previa</span>
            ) : (
              <span className="indicador-local">
                <span aria-hidden="true" className="indicador-local__punto" />
                Panel de empresa
              </span>
            )}
            <div className="usuario-panel">
              <span aria-hidden="true" className="usuario-panel__avatar">
                {iniciales || "T"}
              </span>
              <div className="usuario-panel__datos">
                <strong>{perfil.nombre}</strong>
                <span>
                  {perfil.rol === "administrador" ? "Administración" : "Ventas"}
                </span>
              </div>
            </div>
            <button
              className="boton-salir"
              disabled={saliendo}
              onClick={cerrarSesion}
              type="button"
            >
              {saliendo ? "Saliendo…" : "Salir"}
            </button>
          </div>
        </div>
      </header>

      <div className="contenedor-panel">
        <div className="cuerpo-panel">
          <aside aria-label="Navegación de la empresa" className="carril-panel">
            <div className="carril-panel__empresa">
              <p className="rotulo">EMPRESA</p>
              <strong>Tomhjey</strong>
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
                  >
                    <span aria-hidden="true" className="nav-panel__icono">
                      <Icono nombre={seccion.icono} />
                    </span>
                    {seccion.nombre}
                  </Link>
                );
              })}
            </nav>

            <p className="carril-panel__ayuda">
              La información de tu empresa está protegida por tu cuenta de
              usuario.
            </p>
          </aside>

          <main className="contenido-panel">{children}</main>
        </div>
      </div>
    </>
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
    asistente: (
      <>
        <path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4-1.4 1.4M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
    usuarios: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-1.5A5.5 5.5 0 0 1 8.5 13h1A5.5 5.5 0 0 1 15 18.5V20M16 5.2a3 3 0 0 1 0 5.6M18 14a5.5 5.5 0 0 1 3 4.5V20" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" {...comunes}>
      {trazos[nombre]}
    </svg>
  );
}
