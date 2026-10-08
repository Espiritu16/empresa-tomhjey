import type { ReactNode } from "react";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PanelShell } from "@/funcionalidades/panel/panel-shell";
import { obtenerPerfilActual } from "@/compartido/supabase/perfil-actual";

export const instant = false;

export default function PanelLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <Suspense fallback={<div aria-busy="true" className="cargando-app" />}>
      <PanelProtegido>{children}</PanelProtegido>
    </Suspense>
  );
}

async function PanelProtegido({ children }: Readonly<{ children: ReactNode }>) {
  const perfil = await obtenerPerfilActual();

  if (!perfil?.activo) redirect("/acceso");

  return <PanelShell perfil={perfil}>{children}</PanelShell>;
}
