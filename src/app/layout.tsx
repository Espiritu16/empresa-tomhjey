import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tomhjey · Ventas y facturación",
    template: "%s · Tomhjey",
  },
  description: "Panel de ventas, inventario y facturación de Tomhjey.",
};

// Aplica el tema guardado (o el del sistema) antes de pintar, para evitar
// un destello claro al abrir la página en modo oscuro.
const scriptTema = `try{var t=localStorage.getItem("tomhjey:tema");if(t!=="oscuro"&&t!=="claro")t=matchMedia("(prefers-color-scheme: dark)").matches?"oscuro":"claro";document.documentElement.dataset.tema=t}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body>
        <Suspense fallback={<div aria-busy="true" className="cargando-app" />}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}
