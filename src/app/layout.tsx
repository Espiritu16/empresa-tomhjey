import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Empresa Tomhjey",
  description: "Sistema de ventas y facturación con asistencia de IA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
