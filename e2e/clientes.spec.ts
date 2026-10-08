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

test("administración crea y edita clientes y muestra el historial vacío", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/clientes");
  const alta = page.getByRole("button", { name: "Nuevo cliente" });
  await expect(alta).toBeVisible({ timeout: 1000 });
  await alta.click();
  await page.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page.getByLabel("Nombre del cliente")).toHaveJSProperty(
    "validity.valueMissing",
    true,
  );

  const codigo = randomUUID().slice(0, 8);
  const nombre = `Cliente E2E ${codigo}`;
  const actualizado = `${nombre} actualizado`;
  await page.getByLabel("Tipo de documento").selectOption("dni");
  await page.getByLabel("Número de documento").fill(codigo.padEnd(8, "1"));
  await page.getByLabel("Nombre del cliente").fill(nombre);
  await page.getByLabel("Teléfono").fill("999123456");
  await page.getByRole("button", { name: "Guardar cliente" }).click();

  let fila = page.getByRole("row", { name: new RegExp(nombre) });
  await expect(fila).toBeVisible();
  await fila.getByRole("button", { name: `Editar ${nombre}` }).click();
  await page.getByLabel("Nombre del cliente").fill(actualizado);
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  fila = page.getByRole("row", { name: new RegExp(actualizado) });
  await expect(fila).toBeVisible();
  await fila
    .getByRole("button", { name: `Ver ventas de ${actualizado}` })
    .click();
  await expect(
    page.getByRole("heading", { name: "Historial del cliente" }),
  ).toBeVisible();
  await expect(
    page.getByText("Aún no hay ventas para este cliente."),
  ).toBeVisible();
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
