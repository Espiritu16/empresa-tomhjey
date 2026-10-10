import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { EstadoE2E } from "./configuracion/preparar";

let usuarios: EstadoE2E;

test.beforeAll(async () => {
  const rutaEstado = process.env.EMPRESA_TOMHJEY_E2E_ESTADO;
  if (!rutaEstado)
    throw new Error("Falta el estado temporal de las pruebas E2E.");
  const estado = JSON.parse(await readFile(rutaEstado, "utf8")) as EstadoE2E;
  usuarios = estado;
});

test("exige seleccionar un cliente antes de guardar una venta", async ({
  page,
}) => {
  await iniciarSesion(page, usuarios.administrador);
  await page.goto("/panel/ventas");
  await page.getByRole("button", { name: "Nueva venta" }).click();

  const cliente = page.getByLabel("Cliente");
  await expect(cliente).toHaveJSProperty("validity.valueMissing", true);
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(cliente).toHaveJSProperty("validity.valueMissing", true);
});

test("crea, edita y confirma un borrador con total y stock calculados en el servidor", async ({
  page,
}) => {
  await iniciarSesion(page, usuarios.administrador);
  const sku = `E2E-${randomUUID().slice(0, 8)}`;
  const nombre = `Producto ${sku}`;
  await page.goto("/panel/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Nombre del producto").fill(nombre);
  await page.getByLabel("Precio unitario").fill("10");
  await page.getByLabel("Existencias iniciales").fill("5");
  await page.getByRole("button", { name: "Guardar producto" }).click();

  const cliente = `Cliente ${sku}`;
  await page.goto("/panel/clientes");
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  await page.getByLabel("Nombre del cliente").fill(cliente);
  await page.getByRole("button", { name: "Guardar cliente" }).click();

  await page.goto("/panel/ventas");
  const alta = page.getByRole("button", { name: "Nueva venta" });
  await expect(alta).toBeVisible({ timeout: 1000 });
  await alta.click();
  await page.getByLabel("Cliente").selectOption({ label: cliente });
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(page.getByLabel("Producto")).toHaveJSProperty(
    "validity.valueMissing",
    true,
  );

  await page
    .getByLabel("Producto")
    .selectOption({ label: `${sku} — ${nombre}` });
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: "Agregar producto" }).click();
  await page.getByRole("button", { name: "Guardar borrador" }).click();

  const borrador = page
    .getByRole("row", { name: /Borrador/ })
    .filter({ hasText: cliente });
  await expect(borrador).toContainText("S/ 10.00");
  await borrador.getByRole("button", { name: "Editar borrador" }).click();
  await page.getByLabel("Cantidad de producto 1").fill("2");
  await page.getByRole("button", { name: "Guardar cambios" }).click();

  const actualizado = page
    .getByRole("row", { name: /Borrador/ })
    .filter({ hasText: cliente });
  await expect(actualizado).toContainText("S/ 20.00");
  page.once("dialog", (dialog) => dialog.accept());
  await actualizado.getByRole("button", { name: "Confirmar venta" }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Confirmada" })
      .filter({ hasText: "S/ 20.00" }),
  ).toBeVisible();

  await page.goto("/panel/inventario");
  await expect(
    page
      .getByRole("table")
      .first()
      .getByRole("row", { name: new RegExp(sku) }),
  ).toContainText("3 NIU");

  await page.goto("/panel/reportes");
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible({
    timeout: 1000,
  });
  await expect(page.getByText(nombre, { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "S/ 20.00" })).toBeVisible();
  await page.getByLabel("Desde").fill("2020-01-01");
  await page.getByLabel("Hasta").fill("2020-01-31");
  await page.getByRole("button", { name: "Aplicar periodo" }).click();
  await expect(
    page.getByText("Aún no hay ventas en este periodo"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Salir" }).click();
  await iniciarSesion(page, usuarios.vendedor);
  await page.goto("/panel/reportes");
  await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
  await expect(
    page.getByText("Aún no hay ventas en este periodo"),
  ).toBeVisible();
});

test("permite cancelar el descarte y luego descartar un borrador sin tocar stock", async ({
  page,
}) => {
  await iniciarSesion(page, usuarios.administrador);
  const sku = `E2E-D-${randomUUID().slice(0, 8)}`;
  const nombre = `Producto ${sku}`;
  await page.goto("/panel/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Nombre del producto").fill(nombre);
  await page.getByLabel("Precio unitario").fill("10");
  await page.getByLabel("Existencias iniciales").fill("4");
  await page.getByRole("button", { name: "Guardar producto" }).click();

  const cliente = `Cliente ${sku}`;
  await crearCliente(page, cliente);
  await page.goto("/panel/ventas");
  await page.getByRole("button", { name: "Nueva venta" }).click();
  await page.getByLabel("Cliente").selectOption({ label: cliente });
  await page
    .getByLabel("Producto")
    .selectOption({ label: `${sku} — ${nombre}` });
  await page.getByLabel("Cantidad").fill("2");
  await page.getByRole("button", { name: "Agregar producto" }).click();
  await page.getByRole("button", { name: "Guardar borrador" }).click();

  const borrador = page
    .getByRole("row", { name: /Borrador/ })
    .filter({ hasText: cliente });
  await expect(borrador).toContainText("S/ 20.00");
  page.once("dialog", (dialog) => dialog.dismiss());
  await borrador.getByRole("button", { name: "Descartar borrador" }).click();
  await expect(borrador).toContainText("Borrador");

  page.once("dialog", (dialog) => dialog.accept());
  await borrador.getByRole("button", { name: "Descartar borrador" }).click();
  await expect(page.getByRole("row", { name: /Descartada/ })).toContainText(
    "S/ 20.00",
  );
  await page.goto("/panel/inventario");
  await expect(
    page.getByRole("row", { name: new RegExp(sku) }).first(),
  ).toContainText("4 NIU");
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

async function crearCliente(page: Page, nombre: string): Promise<void> {
  await page.goto("/panel/clientes");
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  await page.getByLabel("Nombre del cliente").fill(nombre);
  await page.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(nombre) }),
  ).toBeVisible();
}
