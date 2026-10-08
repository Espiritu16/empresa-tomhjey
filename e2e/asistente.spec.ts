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

test("valida el mensaje y presenta la respuesta del asistente", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/asistente");
  await expect(
    page.getByRole("heading", { name: "Asistente IA" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(page.getByLabel("Mensaje para el asistente")).toHaveJSProperty(
    "validity.valueMissing",
    true,
  );

  await page.route("**/functions/v1/asistente", async (ruta) => {
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversacionId: "00000000-0000-4000-8000-000000000001",
        mensaje: "Tienes tres productos por reponer.",
      }),
    });
  });
  await page
    .getByLabel("Mensaje para el asistente")
    .fill("¿Qué productos debo reponer?");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(
    page.getByText("Tienes tres productos por reponer."),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Chat con el asistente" })
      .getByText("¿Qué productos debo reponer?", { exact: true }),
  ).toBeVisible();
});

test("responde con el proveedor de IA configurado en local", async ({
  page,
}) => {
  test.skip(
    process.env.EMPRESA_TOMHJEY_E2E_IA_REAL !== "1",
    "La prueba real se ejecuta de forma explícita para controlar el uso de tokens.",
  );
  test.setTimeout(90_000);
  await iniciarSesion(page, administrador);
  await page.goto("/panel/asistente");
  await page
    .getByLabel("Mensaje para el asistente")
    .fill("En una frase, explica para qué sirve la pantalla Inventario.");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  const respuesta = page
    .locator(".asistente-modulo__mensaje--asistente p")
    .last();
  await expect(respuesta).toBeVisible({ timeout: 80_000 });
  await expect(respuesta).toHaveText(/\S+/);
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
