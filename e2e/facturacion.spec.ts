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

test("muestra los flujos de factura y boleta y bloquea emisión sin datos fiscales", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/facturacion");
  await expect(
    page.getByRole("heading", { name: "Facturación" }),
  ).toBeVisible();
  await expect(page.getByText("Falta el RUC de la empresa")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Serie de factura" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Serie de boleta" }),
  ).toBeVisible();
  const ventasFacturables = page.getByRole("button", {
    name: "Emitir factura",
  });
  if ((await ventasFacturables.count()) === 0) {
    await expect(
      page.getByText("No hay ventas listas para emitir"),
    ).toBeVisible();
  } else {
    await expect(ventasFacturables.first()).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Emitir boleta" }).first(),
    ).toBeDisabled();
  }
  await expect(page.getByRole("button", { name: "Guardar serie" })).toHaveCount(
    2,
  );
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
