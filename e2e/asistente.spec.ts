import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
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
        mensaje: "Tienes **tres productos** por reponer.",
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
    page.locator(".asistente-modulo__mensaje--asistente strong"),
  ).toHaveText("tres productos");
  await expect(
    page
      .getByRole("region", { name: "Chat con el asistente" })
      .getByText("¿Qué productos debo reponer?", { exact: true }),
  ).toBeVisible();
});

test("sugiere consultar el catálogo y empezar a preparar una venta", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/asistente");

  const campo = page.getByLabel("Mensaje para el asistente");
  await page
    .getByRole("button", { name: "¿Cuántos productos tenemos?" })
    .click();
  await expect(campo).toHaveValue("¿Cuántos productos tenemos?");
  await page.getByRole("button", { name: "Quiero armar una venta" }).click();
  await expect(campo).toHaveValue("Quiero armar una venta");
});

test("muestra hasta 50 productos como una lista vertical en el chat", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/asistente");
  const nombres = Array.from(
    { length: 50 },
    (_, indice) => `Producto ${String(indice + 1).padStart(2, "0")}`,
  );
  await page.route("**/functions/v1/asistente", async (ruta) => {
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversacionId: "00000000-0000-4000-8000-000000000050",
        mensaje: [
          "Tenemos 50 productos activos:",
          ...nombres.map((nombre) => `• ${nombre}`),
        ].join("\n"),
      }),
    });
  });

  await page
    .getByLabel("Mensaje para el asistente")
    .fill("¿Cuántos productos hay?");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();

  const lista = page.locator(
    ".asistente-modulo__mensaje--asistente ul[aria-label='Resultados del asistente']",
  );
  await expect(lista.getByRole("listitem")).toHaveCount(50);
  await expect(lista.getByRole("listitem").first()).toHaveText("Producto 01");
  await expect(lista.getByRole("listitem").last()).toHaveText("Producto 50");
});

test("envía con Enter y conserva el salto de línea con Shift+Enter", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/asistente");
  await page.route("**/functions/v1/asistente", async (ruta) => {
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversacionId: "00000000-0000-4000-8000-000000000002",
        mensaje: "Respuesta de prueba.",
      }),
    });
  });

  const campo = page.getByLabel("Mensaje para el asistente");
  await campo.fill("Consulta de prueba");
  await campo.press("Shift+Enter");
  await campo.pressSequentially("con detalle");
  const solicitud = page.waitForRequest(
    (peticion) => peticion.url().includes("/functions/v1/asistente"),
    { timeout: 3_000 },
  );
  await campo.press("Enter");

  expect((await solicitud).postDataJSON()).toMatchObject({
    mensaje: "Consulta de prueba\ncon detalle",
  });
  await expect(page.getByText("Respuesta de prueba.")).toBeVisible();
  await expect(campo).toHaveValue("");
});

test("muestra el borrador en el chat y permite confirmarlo manualmente", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/asistente");
  const ventaId = "74000000-0000-4000-8000-000000000001";
  await page.route("**/functions/v1/asistente", async (ruta) => {
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversacionId: "00000000-0000-4000-8000-000000000003",
        mensaje: "Preparé la venta para revisar.",
        borradorVentaId: ventaId,
      }),
    });
  });
  await page.route("**/rest/v1/ventas*", async (ruta) => {
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: ventaId,
          cliente_nombre: "Cliente de prueba",
          estado: "borrador",
          moneda: "PEN",
          total: 59.8,
        },
      ]),
    });
  });
  await page.route("**/rest/v1/lineas_venta*", async (ruta) => {
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          venta_id: ventaId,
          descripcion_congelada: "Polo M",
          cantidad: 2,
          total: 59.8,
        },
      ]),
    });
  });
  await page.route(
    "**/rest/v1/rpc/confirmar_venta_con_comprobante",
    async (ruta) => {
      expect(ruta.request().postDataJSON()).toEqual({
        venta_objetivo: ventaId,
        tipo_comprobante_solicitado: "boleta",
      });
      await ruta.fulfill({ status: 200, body: JSON.stringify(ventaId) });
    },
  );
  await page.route("**/functions/v1/facturacion", async (ruta) => {
    expect(ruta.request().postDataJSON()).toEqual({
      ventaId,
      tipo: "boleta",
    });
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        comprobanteId: "85000000-0000-4000-8000-000000000003",
        estado: "emitido",
        aceptadaPorSunat: null,
      }),
    });
  });

  await page.getByLabel("Mensaje para el asistente").fill("Arma una venta");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();

  const tarjeta = page.getByRole("region", { name: "Borrador de venta" });
  await expect(tarjeta).toContainText("Cliente de prueba");
  await expect(tarjeta).toContainText("Polo M");
  await expect(tarjeta).toContainText("S/ 59.80");
  await tarjeta.getByRole("button", { name: "Confirmar y enviar" }).click();
  await expect(tarjeta).toContainText("Confirmada");
  await expect(
    page.getByText(
      "Venta confirmada y boleta enviada a NubeFacT. La aceptación de SUNAT se consultará después.",
    ),
  ).toBeVisible();
});

test("consulta el catálogo y guía una venta con el proveedor de IA real", async ({
  page,
}) => {
  test.skip(
    process.env.EMPRESA_TOMHJEY_E2E_IA_REAL !== "1",
    "La prueba real se ejecuta de forma explícita para controlar el uso de tokens.",
  );
  test.setTimeout(90_000);
  await iniciarSesion(page, administrador);
  const sku = `E2E-IA-${randomUUID().slice(0, 8)}`;
  const nombreProducto = `Polo de muestra ${randomUUID().slice(0, 6)}`;
  await page.goto("/panel/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Nombre del producto").fill(nombreProducto);
  await page.getByLabel("Precio unitario").fill("29.90");
  await page.getByLabel("Existencias iniciales").fill("5");
  await page.getByRole("button", { name: "Guardar producto" }).click();

  await page.goto("/panel/asistente");
  const campo = page.getByLabel("Mensaje para el asistente");
  const respuestas = page.locator(
    "article.asistente-modulo__mensaje--asistente",
  );
  await expect(
    page.getByRole("heading", { name: "Asistente IA" }),
  ).toBeVisible();

  await campo.fill("¿Cuántos productos activos tenemos?");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(respuestas).toHaveCount(1, { timeout: 40_000 });
  await expect(respuestas.last()).toContainText(/\d+|cero|ninguno/i);

  await campo.fill("¿Cuál es ese producto?");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(respuestas).toHaveCount(2, { timeout: 40_000 });
  await expect(respuestas.last()).toContainText(nombreProducto);

  const nombreCliente = `Cliente asistente ${randomUUID().slice(0, 8)}`;
  await page.goto("/panel/clientes");
  await page.getByRole("button", { name: "Nuevo cliente" }).click();
  await page.getByLabel("Nombre del cliente").fill(nombreCliente);
  await page.getByRole("button", { name: "Guardar cliente" }).click();

  await page.goto("/panel/asistente");
  const campoVenta = page.getByLabel("Mensaje para el asistente");
  await campoVenta.fill("Quiero armar una venta con ese producto");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(respuestas).toHaveCount(3, { timeout: 40_000 });
  await expect(respuestas.last()).toContainText(/cantidad|unidades/i);

  await campoVenta.fill("1 unidad");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(respuestas).toHaveCount(4, { timeout: 40_000 });
  await expect(respuestas.last()).toContainText(/boleta|factura/i);

  await campoVenta.fill("boleta");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(respuestas).toHaveCount(5, { timeout: 40_000 });
  await expect(respuestas.last()).toContainText(/simple|cliente|asignada/i);

  await campoVenta.fill("asignada a un cliente");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(respuestas).toHaveCount(6, { timeout: 40_000 });
  await expect(respuestas.last()).toContainText(/cliente|nombre/i);

  await campoVenta.fill(nombreCliente);
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  await expect(respuestas).toHaveCount(7, { timeout: 40_000 });
  await expect(respuestas.last()).toContainText(/borrador/i);
  const tarjeta = page.getByRole("region", { name: "Borrador de venta" });
  await expect(tarjeta).toContainText(nombreCliente);
  await expect(tarjeta).toContainText(nombreProducto);
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
