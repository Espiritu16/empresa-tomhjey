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

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <Suspense fallback={<div aria-busy="true" className="cargando-app" />}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}
