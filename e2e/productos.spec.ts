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

test("el selector de combinaciones mantiene el checkbox compacto", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();

  const checkbox = page.getByRole("checkbox", {
    name: "Este producto tiene tallas, colores u otras combinaciones",
  });
  const caja = await checkbox.boundingBox();
  const etiqueta = checkbox.locator("xpath=..");
  expect(caja?.width).toBe(18);
  expect(caja?.height).toBe(18);
  await expect(etiqueta).toHaveClass(/modulo-operativo__check/);
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

test("crea combinaciones y permite usarlas en inventario y ventas", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  const sku = `E2E-C-${randomUUID().slice(0, 6)}`;
  const nombre = `Polo ${sku}`;
  await page.goto("/panel/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Nombre del producto").fill(nombre);
  await page
    .getByLabel("Este producto tiene tallas, colores u otras combinaciones")
    .check();
  await page.getByLabel("Precio base por combinación").fill("25");
  await page.getByLabel("Valores de la primera opción").fill("S, M");
  await page.getByRole("button", { name: "Guardar producto" }).click();
  await expect(page.getByRole("row", { name: new RegExp(sku) })).toContainText(
    "Por combinación",
  );

  await page.goto("/panel/inventario");
  await page.getByRole("button", { name: "Registrar ajuste" }).click();
  const opcionInventario = page.getByLabel("Producto o combinación");
  await expect(opcionInventario).toContainText(`${sku}-01 — ${nombre} Talla S`);
  await opcionInventario.selectOption({
    label: `${sku}-01 — ${nombre} Talla S`,
  });
  await page.getByLabel("Cantidad de ajuste").fill("4");
  await page.getByLabel("Motivo del ajuste").fill("Ingreso de prueba E2E");
  await page.getByRole("button", { name: "Guardar ajuste" }).click();
  await expect(
    page.getByRole("row", { name: new RegExp(`${sku}-01`) }),
  ).toContainText("4 NIU");

  await page.goto("/panel/ventas");
  await page.getByRole("button", { name: "Nueva venta" }).click();
  await page
    .getByLabel("Producto")
    .selectOption({ label: `${sku}-01 — ${nombre} Talla S` });
  await page.getByLabel("Cantidad").fill("2");
  await page.getByRole("button", { name: "Agregar producto" }).click();
  await page.getByRole("button", { name: "Guardar borrador" }).click();
  const borrador = page
    .getByRole("row", { name: /Borrador/ })
    .filter({ hasText: /50[,.]00/ });
  await expect(borrador).toContainText("S/ 50.00");
  page.once("dialog", (dialog) => dialog.accept());
  await borrador.getByRole("button", { name: "Confirmar venta" }).click();
  const ventaConfirmada = page
    .getByRole("row", { name: /Confirmada/ })
    .filter({ hasText: /50[,.]00/ });
  await expect(ventaConfirmada).toContainText("50.00");
  await page.goto("/panel/inventario");
  await expect(
    page.getByRole("row", { name: new RegExp(`${sku}-01`) }),
  ).toContainText("2 NIU");
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
