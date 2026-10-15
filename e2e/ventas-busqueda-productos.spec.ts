import { randomUUID } from "node:crypto";
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

test("busca productos por nombre o SKU en el formulario de venta", async ({
  page,
}) => {
  await iniciarSesion(page);
  const sufijo = randomUUID().slice(0, 8).toUpperCase();
  const productos = [
    { sku: `E2E-A-${sufijo}`, nombre: `Casaca ligera ${sufijo}` },
    { sku: `E2E-B-${sufijo}`, nombre: `Polo estampado ${sufijo}` },
  ];

  for (const producto of productos) {
    await page.goto("/panel/productos");
    await page.getByRole("button", { name: "Nuevo producto" }).click();
    await page.getByLabel("SKU").fill(producto.sku);
    await page.getByLabel("Nombre del producto").fill(producto.nombre);
    await page.getByLabel("Precio unitario").fill("25");
    await page.getByLabel("Existencias iniciales").fill("5");
    await page.getByRole("button", { name: "Guardar producto" }).click();
    await expect(
      page.getByRole("row", { name: new RegExp(producto.sku) }),
    ).toBeVisible();
  }

  await page.goto("/panel/ventas");
  await page.getByRole("button", { name: "Nueva venta" }).click();
  const formulario = page.getByRole("dialog", { name: "Nueva venta" });
  await formulario.getByRole("radio", { name: "Boleta simple" }).check();
  const busqueda = formulario.getByRole("combobox", { name: "Producto" });

  await busqueda.click();
  const lista = formulario.getByRole("listbox", {
    name: "Productos disponibles",
  });
  await expect(
    lista.getByRole("option", { name: new RegExp(productos[0].sku) }),
  ).toBeVisible();
  await expect(
    lista.getByRole("option", { name: new RegExp(productos[1].sku) }),
  ).toBeVisible();

  await busqueda.fill(productos[1].sku);
  await expect(
    lista.getByRole("option", { name: new RegExp(productos[1].sku) }),
  ).toBeVisible();
  await expect(
    lista.getByRole("option", { name: new RegExp(productos[0].sku) }),
  ).toHaveCount(0);

  await busqueda.fill(productos[0].nombre);
  await expect(
    lista.getByRole("option", { name: new RegExp(productos[0].nombre) }),
  ).toBeVisible();
  await expect(
    lista.getByRole("option", { name: new RegExp(productos[1].sku) }),
  ).toHaveCount(0);
  await lista
    .getByRole("option", { name: new RegExp(productos[0].nombre) })
    .click();

  await expect(formulario.getByText(productos[0].nombre)).toBeVisible();
  await formulario.getByRole("button", { name: "Agregar producto" }).click();
  await expect(
    formulario.getByRole("row", { name: new RegExp(productos[0].nombre) }),
  ).toBeVisible();
});

test("cierra las listas de cliente y producto al salir de sus buscadores", async ({
  page,
}) => {
  await iniciarSesion(page);
  await page.goto("/panel/ventas");
  await page.getByRole("button", { name: "Nueva venta" }).click();

  const formulario = page.getByRole("dialog", { name: "Nueva venta" });
  const busquedaCliente = formulario.getByRole("combobox", {
    name: "DNI del cliente",
  });
  const listaClientes = formulario.getByRole("listbox", {
    name: "Clientes disponibles",
  });
  const busquedaProducto = formulario.getByRole("combobox", {
    name: "Producto",
  });
  const listaProductos = formulario.getByRole("listbox", {
    name: "Productos disponibles",
  });

  await busquedaCliente.focus();
  await expect(listaClientes).toBeVisible();
  await busquedaProducto.focus();
  await expect(listaClientes).toHaveCount(0);

  await expect(listaProductos).toBeVisible();
  await formulario.getByLabel("Cantidad").focus();
  await expect(listaProductos).toHaveCount(0);
});

async function iniciarSesion(page: Page): Promise<void> {
  await page.goto("/acceso");
  await page.getByLabel("Correo electrónico").fill(administrador.correo);
  await page
    .getByRole("textbox", { name: "Contraseña" })
    .fill(administrador.clave);
  await page.getByRole("button", { name: "Ingresar al panel" }).click();
  await expect(page).toHaveURL(/\/panel$/);
}
