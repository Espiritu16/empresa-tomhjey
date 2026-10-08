import type { Metadata } from "next";
import { connection } from "next/server";
import {
  consultarReporte,
  periodoDelMes,
} from "@/funcionalidades/reportes/consultas";
import { PaginaReportes } from "@/funcionalidades/reportes/pagina-reportes";

export const metadata: Metadata = { title: "Reportes" };

export default async function ReportesPage() {
  await connection();
  const periodo = periodoDelMes();
  const datos = await consultarReporte(periodo.desde, periodo.hasta);
  return (
    <PaginaReportes
      periodoInicial={periodo}
      filasIniciales={datos.filas}
      resumenInicial={datos.resumen}
      errorInicial={datos.error}
    />
  );
}
