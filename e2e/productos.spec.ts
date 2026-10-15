import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { EstadoE2E } from "./configuracion/preparar";

let administrador: EstadoE2E["administrador"];
let identificadorE2E: string;

test.beforeAll(async () => {
  const rutaEstado = process.env.EMPRESA_TOMHJEY_E2E_ESTADO;
  if (!rutaEstado)
    throw new Error("Falta el estado temporal de las pruebas E2E.");
  const estado = JSON.parse(await readFile(rutaEstado, "utf8")) as EstadoE2E;
  administrador = estado.administrador;
  identificadorE2E = estado.identificadorE2E;
});

test("el modal de producto solo ofrece los campos simples del MVP", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();

  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByLabel("Precio unitario")).toBeVisible();
  await expect(page.getByLabel("Existencias iniciales")).toBeVisible();
  await expect(page.getByLabel("Talla para agregar")).toHaveCount(0);
  await expect(page.getByLabel("Color para agregar")).toHaveCount(0);
});

test("administración crea y edita un producto y el formulario rechaza campos vacíos", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/productos");

  await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible();
  const categoria = `E2E-${identificadorE2E}-categoria-${randomUUID().slice(0, 8)}`;
  await page.getByRole("button", { name: "Nueva categoría" }).click();
  await page.getByLabel("Nombre de la categoría").fill(categoria);
  await page.getByRole("button", { name: "Guardar categoría" }).click();
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByRole("button", { name: "Guardar producto" }).click();

  await expect(page.getByLabel("SKU")).toHaveJSProperty(
    "validity.valueMissing",
    true,
  );
  await expect(page.getByLabel("Nombre del producto")).toHaveJSProperty(
    "validity.valueMissing",
    true,
  );

  const sku = `E2E-${randomUUID().slice(0, 8)}`;
  const nombreOriginal = `Producto ${sku}`;
  const nombreEditado = `${nombreOriginal} editado`;

  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Nombre del producto").fill(nombreOriginal);
  await page.getByLabel("Categoría").selectOption({ label: categoria });
  await page.getByLabel("Precio unitario").fill("12.50");
  await page.getByLabel("Existencias iniciales").fill("5");
  await page.getByLabel("Stock mínimo").fill("2");
  await page.getByRole("button", { name: "Guardar producto" }).click();

  const fila = page.getByRole("row", { name: new RegExp(sku) });
  await expect(fila).toContainText(nombreOriginal);
  await fila.getByRole("button", { name: `Editar ${nombreOriginal}` }).click();
  await page.getByLabel("Nombre del producto").fill(nombreEditado);
  await page.getByLabel("Precio unitario").fill("14.75");
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  const productoActualizado = page.getByRole("row", { name: new RegExp(sku) });
  await expect(productoActualizado).toContainText(nombreEditado);
  await expect(productoActualizado).toContainText("S/ 14.75");

  await productoActualizado
    .getByRole("button", { name: `Inactivar ${nombreEditado}` })
    .click();
  await expect(productoActualizado).toContainText("Inactivo");
  await productoActualizado
    .getByRole("button", { name: `Activar ${nombreEditado}` })
    .click();
  await expect(productoActualizado).toContainText("Activo");
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
