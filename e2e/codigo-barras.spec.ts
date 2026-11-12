import { randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { EstadoE2E } from "./configuracion/preparar";

let administrador: EstadoE2E["administrador"];

test.beforeAll(async () => {
  const rutaEstado = process.env.EMPRESA_TOMHJEY_E2E_ESTADO;
  if (!rutaEstado)
    throw new Error("Falta el estado temporal de las pruebas E2E.");
  const estado = JSON.parse(await readFile(rutaEstado, "utf8")) as EstadoE2E;
  administrador = estado.administrador;
});

test("un código de barras con Enter agrega el producto a la venta", async ({
  page,
}) => {
  const sku = `E2E-${randomUUID().slice(0, 8)}`;
  const nombre = `Producto ${sku}`;
  // 13 dígitos, como un EAN-13; el sistema solo exige que sea único.
  const codigo = `99${String(randomInt(0, 1e11)).padStart(11, "0")}`;

  await iniciarSesion(page, administrador);
  await page.goto("/panel/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("Nombre del producto").fill(nombre);
  await page.getByLabel("SKU").fill(sku);
  const campoCodigo = page.getByRole("textbox", { name: "Código de barras" });
  await campoCodigo.fill(codigo);
  // La pistola lectora termina con Enter: no debe guardar el formulario.
  await campoCodigo.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Precio unitario").fill("10");
  await page.getByLabel("Existencias iniciales").fill("5");
  await page.getByRole("button", { name: "Guardar producto" }).click();

  await page.getByLabel("Buscar productos").fill(codigo);
  await expect(page.getByRole("row", { name: new RegExp(sku) })).toBeVisible();

  await page.goto("/panel/ventas");
  await page.getByRole("button", { name: "Nueva venta" }).click();
  const buscador = page.getByRole("combobox", { name: "Producto" });
  await buscador.fill(codigo);
  await buscador.press("Enter");
  await buscador.fill(codigo);
  await buscador.press("Enter");

  const lineas = page.getByRole("dialog").getByRole("table");
  await expect(lineas).toContainText(nombre);
  await expect(lineas.getByLabel("Cantidad de producto 1")).toHaveValue("2");

  await buscador.fill("0000000000000");
  await buscador.press("Enter");
  await expect(
    page
      .getByRole("dialog")
      .getByText("No hay ningún producto con el código 0000000000000."),
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
