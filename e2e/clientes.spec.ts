import { randomInt, randomUUID } from "node:crypto";
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
  const numeroDni = String(randomInt(0, 100_000_000)).padStart(8, "0");
  await page.getByLabel("Tipo de documento").selectOption("dni");
  await page.getByLabel("Número de documento").fill(numeroDni);
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
  await fila.getByRole("button", { name: `Inactivar ${actualizado}` }).click();
  await expect(fila).toContainText("Inactivo");
  await fila.getByRole("button", { name: `Activar ${actualizado}` }).click();
  await expect(fila).toContainText("Activo");
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

test("consulta un DNI en SUNAT y completa el nombre del cliente", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/clientes");
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  await page.getByLabel("Tipo de documento").selectOption("dni");
  await page.getByLabel("Número de documento").fill("12345678");

  await page.route("**/api/clientes/consultar-documento", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      tipoDocumento: "dni",
      numeroDocumento: "12345678",
    });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        nombre: "ESPIRITU CASTILLO,KEVIN OCTAVIO",
        direccion: null,
      }),
    });
  });

  await page.getByRole("button", { name: "Consultar" }).click();

  await expect(page.getByLabel("Nombre del cliente")).toHaveValue(
    "KEVIN OCTAVIO ESPIRITU CASTILLO",
  );
  await expect(page.getByText("Datos consultados en SUNAT.")).toBeVisible();
  await expect(
    page.getByText("Al consultar, el número se envía a SUNAT."),
  ).toBeVisible();
});

test("consulta un RUC y completa razón social, dirección y tipo de persona", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/clientes");
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  await page.getByLabel("Tipo de documento").selectOption("ruc");
  await page.getByLabel("Número de documento").fill("20100130204");

  await page.route("**/api/clientes/consultar-documento", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      tipoDocumento: "ruc",
      numeroDocumento: "20100130204",
    });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        nombre: "EMPRESA DE PRUEBA S.A.C.",
        direccion: "AV. DE PRUEBA 123, LIMA",
        tipoRuc: "persona_juridica",
      }),
    });
  });

  await page.getByRole("button", { name: "Consultar" }).click();

  await expect(page.getByLabel("Nombre del cliente")).toHaveValue(
    "EMPRESA DE PRUEBA S.A.C.",
  );
  await expect(page.getByLabel("Dirección")).toHaveValue(
    "AV. DE PRUEBA 123, LIMA",
  );
  await expect(page.getByText("RUC de persona jurídica")).toBeVisible();
});

test("el backend rechaza documentos inválidos antes de consultar SUNAT", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  const respuesta = await page.request.post(
    "/api/clientes/consultar-documento",
    { data: { tipoDocumento: "dni", numeroDocumento: "1234A678" } },
  );

  expect(respuesta.status()).toBe(400);
  await expect(respuesta.json()).resolves.toMatchObject({
    error: "Escribe un DNI de ocho dígitos.",
  });
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
