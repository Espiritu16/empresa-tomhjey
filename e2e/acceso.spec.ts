import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { EstadoE2E } from "./configuracion/preparar";

let usuarios: EstadoE2E;

test.beforeAll(async () => {
  const rutaEstado = process.env.EMPRESA_TOMHJEY_E2E_ESTADO;
  if (!rutaEstado)
    throw new Error("Falta el estado temporal de las pruebas E2E.");
  usuarios = JSON.parse(await readFile(rutaEstado, "utf8")) as EstadoE2E;
});

test("impide enviar el formulario vacío y valida el formato del correo", async ({
  page,
}) => {
  await page.goto("/acceso");

  const correo = page.getByLabel("Correo electrónico");
  const clave = page.getByRole("textbox", { name: "Contraseña" });

  await page.getByRole("button", { name: "Ingresar al panel" }).click();
  await expect(correo).toHaveJSProperty("validity.valueMissing", true);
  await expect(clave).toHaveJSProperty("validity.valueMissing", true);
  await expectRuta(page, "/acceso");

  await correo.fill("correo-inválido");
  await clave.fill("clave temporal");
  await page.getByRole("button", { name: "Ingresar al panel" }).click();
  await expect(correo).toHaveJSProperty("validity.typeMismatch", true);
  await expect(
    page.getByText(
      "No pudimos iniciar sesión. Revisa el correo y la contraseña.",
      { exact: true },
    ),
  ).toHaveCount(0);
});

test("permite corregir los campos y mostrar u ocultar la contraseña", async ({
  page,
}) => {
  await page.goto("/acceso");

  const correo = page.getByLabel("Correo electrónico");
  const clave = page.getByRole("textbox", { name: "Contraseña" });
  await correo.fill("incorrecto");
  await correo.fill(usuarios.administrador.correo);
  await clave.fill(usuarios.administrador.clave);

  await expect(clave).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(clave).toHaveAttribute("type", "text");
  await expect(clave).toHaveValue(usuarios.administrador.clave);
  await page.getByRole("button", { name: "Ocultar contraseña" }).click();
  await expect(clave).toHaveAttribute("type", "password");
  await expect(clave).toHaveValue(usuarios.administrador.clave);
});

test("muestra un error de credenciales y permite volver a intentarlo", async ({
  page,
}) => {
  await page.goto("/acceso");
  await page
    .getByLabel("Correo electrónico")
    .fill(usuarios.administrador.correo);
  await page
    .getByRole("textbox", { name: "Contraseña" })
    .fill("clave-incorrecta-e2e");
  await page.getByRole("button", { name: "Ingresar al panel" }).click();

  await expect(
    page.getByText(
      "No pudimos iniciar sesión. Revisa el correo y la contraseña.",
      { exact: true },
    ),
  ).toBeVisible();

  await page
    .getByRole("textbox", { name: "Contraseña" })
    .fill(usuarios.administrador.clave);
  await page.getByRole("button", { name: "Ingresar al panel" }).click();
  await expectRuta(page, "/panel");
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
});

test("redirige al acceso cuando se abre el panel sin una sesión", async ({
  page,
}) => {
  await page.goto("/panel");
  await expectRuta(page, "/acceso");
  await expect(
    page.getByRole("heading", { name: "Inicia sesión" }),
  ).toBeVisible();

  await iniciarSesion(page, usuarios.vendedor);
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
});

test("el administrador puede recorrer los módulos y cerrar sesión", async ({
  page,
}) => {
  await iniciarSesion(page, usuarios.administrador);
  await expect(page.getByText("Administración", { exact: true })).toBeVisible();

  const modulos = [
    ["Ventas", "ventas", "Ventas"],
    ["Productos", "productos", "Productos"],
    ["Inventario", "inventario", "Inventario"],
    ["Clientes", "clientes", "Clientes"],
    ["Reportes", "reportes", "Reportes"],
    ["Facturación", "facturacion", "Facturación"],
    ["Empresa", "empresa", "Empresa y configuración"],
    ["Usuarios", "usuarios", "Usuarios"],
  ] as const;

  for (const [nombre, ruta, encabezado] of modulos) {
    await page.getByRole("link", { name: nombre, exact: true }).click();
    await expectRuta(page, `/panel/${ruta}`);
    await expect(page.getByRole("heading", { name: encabezado })).toBeVisible();
  }

  await page.getByRole("button", { name: "Salir" }).click();
  await expectRuta(page, "/acceso");
  await expect(
    page.getByRole("heading", { name: "Inicia sesión" }),
  ).toBeVisible();
});

test("el vendedor no ve ni puede abrir el módulo de usuarios", async ({
  page,
}) => {
  await iniciarSesion(page, usuarios.vendedor);
  await expect(page.getByText("Ventas", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Usuarios", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Empresa", exact: true }),
  ).toHaveCount(0);

  await page.goto("/panel/usuarios");
  await expectRuta(page, "/panel");
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();

  await page.goto("/panel/productos");
  await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nuevo producto" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nueva categoría" }),
  ).toHaveCount(0);
  await page.goto("/panel/inventario");
  await expect(page.getByRole("heading", { name: "Inventario" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Registrar ajuste" }),
  ).toHaveCount(0);
  await page.goto("/panel/empresa");
  await expectRuta(page, "/panel");
  await page.goto("/panel/clientes");
  await expect(page.getByRole("heading", { name: "Clientes" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(Inactivar|Activar) / }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/acceso$/);
});

test("el acceso y el panel caben en una pantalla móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/acceso");
  await expectSinDesbordeHorizontal(page);

  await iniciarSesion(page, usuarios.vendedor);
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible();
  await expectSinDesbordeHorizontal(page);
  for (const ruta of [
    "productos",
    "inventario",
    "clientes",
    "ventas",
    "reportes",
    "asistente",
  ]) {
    await page.goto(`/panel/${ruta}`);
    await expectSinDesbordeHorizontal(page);
  }
});

async function iniciarSesion(
  page: Page,
  usuario: EstadoE2E["administrador"],
): Promise<void> {
  await page.goto("/acceso");
  await page.getByLabel("Correo electrónico").fill(usuario.correo);
  await page.getByRole("textbox", { name: "Contraseña" }).fill(usuario.clave);
  await page.getByRole("button", { name: "Ingresar al panel" }).click();
  await expectRuta(page, "/panel");
}

async function expectRuta(page: Page, rutaEsperada: string): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => window.location.pathname), {
      message: `La página debía navegar a ${rutaEsperada}`,
    })
    .toBe(rutaEsperada);
}

async function expectSinDesbordeHorizontal(page: Page): Promise<void> {
  const tieneDesborde = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(tieneDesborde).toBe(false);
}
