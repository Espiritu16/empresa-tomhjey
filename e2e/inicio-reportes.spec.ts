import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { EstadoE2E } from "./configuracion/preparar";

let administrador: EstadoE2E["administrador"];

test.beforeAll(async () => {
  const rutaEstado = process.env.EMPRESA_TOMHJEY_E2E_ESTADO;
  if (!rutaEstado)
    throw new Error("Falta el estado temporal de las pruebas E2E.");
  const estado = JSON.parse(await readFile(rutaEstado, "utf8")) as EstadoE2E;
  administrador = estado.administrador;
});

test("Inicio muestra el tablero de indicadores sin el asistente", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);

  await expect(
    page.getByRole("heading", { name: "Inicio", exact: true }),
  ).toBeVisible();
  const indicadores = page.getByRole("region", {
    name: "Indicadores de la empresa",
  });
  for (const rotulo of [
    "Vendido hoy",
    "Ventas confirmadas hoy",
    "Ticket promedio",
    "Vendido este mes",
  ]) {
    await expect(indicadores.getByText(rotulo, { exact: true })).toBeVisible();
  }
  for (const seccion of [
    "Ventas de los últimos 7 días",
    "Más vendidos del mes",
    "Por reponer",
    "Comprobantes pendientes",
    "Últimas ventas",
  ]) {
    await expect(
      page.getByRole("heading", { name: new RegExp(`^${seccion}`) }),
    ).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Asistente IA" })).toHaveCount(0);
});

test("Reportes valida el rango y carga el periodo solicitado", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/reportes");

  await expect(
    page.getByRole("heading", { name: "Reportes", exact: true }),
  ).toBeVisible();
  const desde = page.getByLabel("Desde");
  const hasta = page.getByLabel("Hasta");
  await expect(desde).toHaveJSProperty("validity.valueMissing", false);
  await expect(hasta).toHaveJSProperty("validity.valueMissing", false);

  await desde.fill("2030-02-02");
  await hasta.fill("2030-02-01");
  await page.getByRole("button", { name: "Aplicar periodo" }).click();
  await expect(
    page.getByText("Elige un rango de fechas válido.", { exact: true }),
  ).toBeVisible();

  await desde.fill("2030-02-01");
  await hasta.fill("2030-02-02");
  await page.getByRole("button", { name: "Aplicar periodo" }).click();
  await expect(
    page.getByRole("region", { name: "Resumen de ventas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Detalle del periodo" }),
  ).toBeVisible();
  await expect(
    page.getByText("Elige un rango de fechas válido.", { exact: true }),
  ).toHaveCount(0);
});

async function iniciarSesion(
  page: Page,
  usuario: EstadoE2E["administrador"],
): Promise<void> {
  await page.goto("/acceso");
  await page.getByLabel("Correo electrónico").fill(usuario.correo);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(usuario.clave);
  await page.getByRole("button", { name: "Ingresar al panel" }).click();
  await expect(page).toHaveURL(/\/panel$/);
}
