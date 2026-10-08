import { randomUUID } from "node:crypto";
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

test("guarda la configuración comercial y el servidor rechaza un RUC inválido", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/empresa");
  await expect(
    page.getByRole("heading", { name: "Empresa y configuración" }),
  ).toBeVisible({ timeout: 1000 });
  await page.getByLabel("Nombre de la empresa").fill("Empresa E2E configurada");
  await page.getByRole("button", { name: "Guardar empresa" }).click();
  await expect(
    page.getByText("La configuración de empresa se guardó."),
  ).toBeVisible();
  await page.getByLabel("RUC").fill("20100066604");
  await page.getByRole("button", { name: "Guardar empresa" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "El RUC no es válido." }).first(),
  ).toBeVisible();
});

test("administra roles e invita a un vendedor con validación de correo", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/usuarios");
  const invitar = page.getByRole("button", { name: "Invitar vendedor" });
  await expect(invitar).toBeVisible({ timeout: 1000 });
  const vendedor = page.getByRole("row", { name: /Vendedor E2E/ });
  await expect(vendedor).toContainText("Activo");
  await vendedor
    .getByRole("button", { name: "Desactivar Vendedor E2E" })
    .click();
  await expect(vendedor).toContainText("Inactivo");
  await vendedor.getByRole("button", { name: "Activar Vendedor E2E" }).click();
  await expect(vendedor).toContainText("Activo");
  await invitar.click();
  await page.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(page.getByLabel("Correo electrónico")).toHaveJSProperty(
    "validity.valueMissing",
    true,
  );

  const correo = `e2e-invitado-${randomUUID()}@example.com`;
  await page.getByLabel("Correo electrónico").fill(correo);
  await page.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(page.getByText("La invitación se envió.")).toBeVisible();
  await expect(
    page.getByRole("row", { name: new RegExp(correo) }),
  ).toContainText("Pendiente");
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
