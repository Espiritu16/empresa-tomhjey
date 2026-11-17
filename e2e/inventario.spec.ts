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

test("muestra el stock actual y permite definir el nuevo stock con motivo", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  const sku = `E2E-${randomUUID().slice(0, 8)}`;
  await page.goto("/panel/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Nombre del producto").fill(`Producto ${sku}`);
  await page.getByLabel("Precio unitario").fill("10");
  await page.getByLabel("Existencias iniciales").fill("5");
  await page.getByRole("button", { name: "Guardar producto" }).click();

  await page.goto("/panel/inventario");
  const ajuste = page.getByRole("button", { name: "Registrar ajuste" });
  await expect(ajuste).toBeVisible({ timeout: 1000 });
  await ajuste.click();
  await page.getByLabel("Producto o combinación").selectOption({
    label: `${sku} — Producto ${sku}`,
  });
  const stockActual = page.getByLabel("Stock actual");
  const stockNuevo = page.getByLabel("Nuevo stock");
  await expect(stockActual).toHaveValue("5");
  await expect(stockNuevo).toHaveValue("");
  const cajaStockActual = await stockActual.boundingBox();
  const cajaStockNuevo = await stockNuevo.boundingBox();
  expect(cajaStockActual).not.toBeNull();
  expect(cajaStockNuevo).not.toBeNull();
  expect(Math.abs(cajaStockActual!.y - cajaStockNuevo!.y)).toBeLessThan(2);
  await stockNuevo.fill("3");
  await page.getByLabel("Motivo del ajuste").fill("");
  await page.getByRole("button", { name: "Guardar ajuste" }).click();
  await expect(page.getByLabel("Motivo del ajuste")).toHaveJSProperty(
    "validity.valueMissing",
    true,
  );

  await page.getByLabel("Motivo del ajuste").fill("Conteo de almacén");
  await page.getByRole("button", { name: "Guardar ajuste" }).click();
  await expect(
    page
      .getByRole("table")
      .first()
      .getByRole("row", { name: new RegExp(sku) }),
  ).toContainText("3 NIU");
  await expect(page.getByText("Conteo de almacén")).toBeVisible();
});

test("registra una entrada de mercadería que suma al stock", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  const sku = `E2E-${randomUUID().slice(0, 8)}`;
  await page.goto("/panel/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Nombre del producto").fill(`Producto ${sku}`);
  await page.getByLabel("Precio unitario").fill("10");
  await page.getByLabel("Existencias iniciales").fill("5");
  await page.getByRole("button", { name: "Guardar producto" }).click();

  await page.goto("/panel/inventario");
  await page.getByRole("button", { name: "Registrar entrada" }).click();
  await page.getByLabel("Producto de la entrada").selectOption({
    label: `${sku} — Producto ${sku}`,
  });
  await page.getByLabel("Unidades que entran").fill("7");
  await expect(page.getByLabel("Stock después de la entrada")).toHaveValue(
    "12",
  );
  await expect(page.getByLabel("Motivo de la entrada")).toHaveValue(
    "Compra a proveedor",
  );
  await page.getByRole("button", { name: "Guardar entrada" }).click();

  await expect(
    page
      .getByRole("table")
      .first()
      .getByRole("row", { name: new RegExp(sku) }),
  ).toContainText("12 NIU");
  const movimiento = page
    .getByRole("row", { name: /Compra a proveedor/ })
    .first();
  await expect(movimiento).toContainText("Entrada");
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
