import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { EstadoE2E } from "./configuracion/preparar";
import { crearClienteAdministradorLocal } from "./configuracion/supabase-local";

let usuarios: EstadoE2E;

test.beforeAll(async () => {
  const rutaEstado = process.env.EMPRESA_TOMHJEY_E2E_ESTADO;
  if (!rutaEstado)
    throw new Error("Falta el estado temporal de las pruebas E2E.");
  const estado = JSON.parse(await readFile(rutaEstado, "utf8")) as EstadoE2E;
  usuarios = estado;
});

test("permite boleta simple sin cliente y reserva factura para clientes con RUC", async ({
  page,
}) => {
  await iniciarSesion(page, usuarios.administrador);
  await page.goto("/panel/ventas");
  await page.getByRole("button", { name: "Nueva venta" }).click();

  await page.getByRole("radio", { name: "Boleta simple" }).check();
  await expect(page.getByLabel("DNI del cliente")).toHaveCount(0);
  await expect(page.getByLabel("RUC del cliente")).toHaveCount(0);
  await expect(page.getByLabel("Factura", { exact: true })).toBeEnabled();
  await page.getByLabel("Factura", { exact: true }).check();
  await expect(page.getByLabel("RUC del cliente")).toBeVisible();
  await page.getByRole("radio", { name: "Boleta simple" }).check();
  await expect(
    page.getByText(
      "Se emitirá sin asignar cliente para totales menores de S/ 700. Desde S/ 700 exactos, se requiere identificar al comprador: cambia a Boleta y selecciona un cliente con DNI antes de confirmar.",
    ),
  ).toBeVisible();
});

test("guarda un borrador y registra al cliente consultado por DNI", async ({
  page,
}) => {
  await iniciarSesion(page, usuarios.administrador);
  const sufijo = randomUUID().slice(0, 8);
  const sku = `E2E-DNI-${sufijo}`;
  const nombreProducto = `Producto ${sku}`;
  const nombreCliente = `Cliente consultado ${sufijo}`;
  const dni = "11111111";

  await page.route("**/api/clientes/consultar-documento", async (ruta) => {
    const solicitud = ruta.request().postDataJSON() as {
      tipoDocumento?: string;
      numeroDocumento?: string;
    };
    expect(solicitud).toEqual({ tipoDocumento: "dni", numeroDocumento: dni });
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ nombre: nombreCliente, direccion: null }),
    });
  });

  await page.goto("/panel/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Nombre del producto").fill(nombreProducto);
  await page.getByLabel("Precio unitario").fill("10");
  await page.getByLabel("Existencias iniciales").fill("2");
  await page.getByRole("button", { name: "Guardar producto" }).click();

  await page.goto("/panel/ventas");
  await page.getByRole("button", { name: "Nueva venta" }).click();
  const nuevaVenta = page.getByRole("dialog", { name: "Nueva venta" });
  await nuevaVenta.getByLabel("DNI del cliente").fill(dni);
  await nuevaVenta
    .getByRole("button", { name: "Consultar DNI en SUNAT" })
    .click();
  await expect(nuevaVenta.getByRole("status")).toContainText(nombreCliente);

  const busquedaProducto = nuevaVenta.getByRole("combobox", {
    name: "Producto",
  });
  await busquedaProducto.fill(sku);
  await nuevaVenta
    .getByRole("option", { name: new RegExp(nombreProducto) })
    .click();
  await nuevaVenta.getByLabel("Cantidad").fill("1");
  await nuevaVenta.getByRole("button", { name: "Agregar producto" }).click();
  await nuevaVenta.getByRole("button", { name: "Guardar borrador" }).click();

  const borrador = page.getByRole("row", { name: /Borrador/ }).filter({
    hasText: nombreCliente,
  });
  await expect(borrador).toContainText("S/ 10.00");

  const supabase = crearClienteAdministradorLocal();
  const { data: cliente, error } = await supabase
    .from("clientes")
    .select("nombre, numero_documento")
    .eq("tipo_documento", "dni")
    .eq("numero_documento", dni)
    .eq("creado_por", usuarios.administrador.id)
    .single();
  expect(error).toBeNull();
  expect(cliente).toEqual({ nombre: nombreCliente, numero_documento: dni });
});

test("mantiene visible el envío y bloquea la confirmación hasta responder NubeFacT", async ({
  page,
}) => {
  await iniciarSesion(page, usuarios.administrador);
  const sku = `E2E-ENVIO-${randomUUID().slice(0, 8)}`;
  const nombre = `Producto ${sku}`;
  await page.goto("/panel/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Nombre del producto").fill(nombre);
  await page.getByLabel("Precio unitario").fill("10");
  await page.getByLabel("Existencias iniciales").fill("2");
  await page.getByRole("button", { name: "Guardar producto" }).click();

  let completarEmision!: () => void;
  const emisionPendiente = new Promise<void>((resolver) => {
    completarEmision = resolver;
  });
  await page.route("**/functions/v1/facturacion", async (ruta) => {
    await emisionPendiente;
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        comprobanteId: randomUUID(),
        estado: "emitido",
        aceptadaPorSunat: null,
      }),
    });
  });

  await page.goto("/panel/ventas");
  await page.getByRole("button", { name: "Nueva venta" }).click();
  const nuevaVenta = page.getByRole("dialog", { name: "Nueva venta" });
  await nuevaVenta.getByRole("radio", { name: "Boleta simple" }).check();
  const busquedaProducto = nuevaVenta.getByRole("combobox", {
    name: "Producto",
  });
  await busquedaProducto.fill(sku);
  await nuevaVenta.getByRole("option", { name: new RegExp(nombre) }).click();
  await nuevaVenta.getByLabel("Cantidad").fill("1");
  await nuevaVenta.getByRole("button", { name: "Agregar producto" }).click();
  await nuevaVenta.getByRole("button", { name: "Guardar borrador" }).click();

  const borrador = page.getByRole("row", { name: /Borrador/ }).filter({
    hasText: "Venta de mostrador",
  });
  await borrador.getByRole("button", { name: "Confirmar venta" }).click();
  const confirmacion = page.getByRole("dialog", {
    name: "Confirmar venta y emitir comprobante",
  });
  const respuestaFacturacion = page.waitForRequest((solicitud) =>
    solicitud.url().includes("/functions/v1/facturacion"),
  );
  await confirmacion
    .getByRole("button", { name: "Confirmar y enviar" })
    .click();
  await respuestaFacturacion;

  const enviar = confirmacion.getByRole("button", {
    name: "Enviando comprobante…",
  });
  await expect(confirmacion).toBeVisible();
  await expect(enviar).toBeDisabled();
  completarEmision();
  await expect(confirmacion).not.toBeVisible();
  await expect(
    page.getByText(
      "Venta confirmada y boleta enviada a NubeFacT. La aceptación de SUNAT se consultará después.",
    ),
  ).toBeVisible();
});

test("permite confirmar la venta desde el modal sin volver a la lista", async ({
  page,
}) => {
  await iniciarSesion(page, usuarios.administrador);
  const sku = `E2E-DIRECTA-${randomUUID().slice(0, 8)}`;
  const nombre = `Producto ${sku}`;

  await page.goto("/panel/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Nombre del producto").fill(nombre);
  await page.getByLabel("Precio unitario").fill("10");
  await page.getByLabel("Existencias iniciales").fill("2");
  await page.getByRole("button", { name: "Guardar producto" }).click();

  await page.route("**/functions/v1/facturacion", async (ruta) => {
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        comprobanteId: randomUUID(),
        estado: "emitido",
        aceptadaPorSunat: null,
      }),
    });
  });

  await page.goto("/panel/ventas");
  await page.getByRole("button", { name: "Nueva venta" }).click();
  const nuevaVenta = page.getByRole("dialog", { name: "Nueva venta" });
  await nuevaVenta.getByRole("radio", { name: "Boleta simple" }).check();
  const busquedaProducto = nuevaVenta.getByRole("combobox", {
    name: "Producto",
  });
  await busquedaProducto.fill(sku);
  await nuevaVenta.getByRole("option", { name: new RegExp(nombre) }).click();
  await nuevaVenta.getByLabel("Cantidad").fill("1");
  await nuevaVenta.getByRole("button", { name: "Agregar producto" }).click();

  await nuevaVenta.getByRole("button", { name: "Confirmar venta" }).click();

  const confirmacion = page.getByRole("dialog", {
    name: "Confirmar venta y emitir comprobante",
  });
  await expect(confirmacion).toBeVisible();
  await expect(confirmacion).toContainText("Venta de mostrador");
  await expect(confirmacion).toContainText("S/ 10.00");
  await expect(nuevaVenta).not.toBeVisible();

  await confirmacion
    .getByRole("button", { name: "Confirmar y enviar" })
    .click();
  await expect(confirmacion).not.toBeVisible();
  await expect(
    page.getByText(
      "Venta confirmada y boleta enviada a NubeFacT. La aceptación de SUNAT se consultará después.",
    ),
  ).toBeVisible();
});

test("no guarda un borrador que supera las existencias disponibles", async ({
  page,
}) => {
  await iniciarSesion(page, usuarios.administrador);
  const sku = `E2E-STOCK-${randomUUID().slice(0, 8)}`;
  const nombre = `Producto ${sku}`;
  await page.goto("/panel/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Nombre del producto").fill(nombre);
  await page.getByLabel("Precio unitario").fill("10");
  await page.getByLabel("Existencias iniciales").fill("1");
  await page.getByRole("button", { name: "Guardar producto" }).click();

  await page.goto("/panel/ventas");
  await page.getByRole("button", { name: "Nueva venta" }).click();
  const nuevaVenta = page.getByRole("dialog", { name: "Nueva venta" });
  await nuevaVenta.getByRole("radio", { name: "Boleta simple" }).check();
  const busquedaProducto = nuevaVenta.getByRole("combobox", {
    name: "Producto",
  });
  await busquedaProducto.fill(sku);
  await nuevaVenta.getByRole("option", { name: new RegExp(nombre) }).click();
  await nuevaVenta.getByLabel("Cantidad").fill("2");
  await nuevaVenta.getByRole("button", { name: "Agregar producto" }).click();
  await nuevaVenta.getByRole("button", { name: "Guardar borrador" }).click();

  await expect(
    page.getByText(
      "No hay stock suficiente para completar la venta. Reduce la cantidad o ajusta las existencias antes de guardar o confirmar.",
    ),
  ).toBeVisible();
  await expect(nuevaVenta).toBeVisible();
  await nuevaVenta.getByRole("button", { name: "Confirmar venta" }).click();
  await expect(
    page.getByText(
      "No hay stock suficiente para completar la venta. Reduce la cantidad o ajusta las existencias antes de guardar o confirmar.",
    ),
  ).toBeVisible();
  await expect(nuevaVenta).toBeVisible();
  await page.goto("/panel/inventario");
  await expect(
    page.getByRole("row", { name: new RegExp(sku) }).first(),
  ).toContainText("1 NIU");
});

test("crea, edita y confirma un borrador con total y stock calculados en el servidor", async ({
  page,
  browser,
}) => {
  await iniciarSesion(page, usuarios.administrador);
  const restaurarConfiguracion = await prepararRucTemporal();
  try {
    const sku = `E2E-${randomUUID().slice(0, 8)}`;
    const nombre = `Producto ${sku}`;
    await page.goto("/panel/productos");
    await page.getByRole("button", { name: "Nuevo producto" }).click();
    await page.getByLabel("SKU").fill(sku);
    await page.getByLabel("Nombre del producto").fill(nombre);
    await page.getByLabel("Precio unitario").fill("10");
    await page.getByLabel("Existencias iniciales").fill("5");
    await page.getByRole("button", { name: "Guardar producto" }).click();

    await page.goto("/panel/ventas");
    await page.route("**/functions/v1/facturacion", async (ruta) => {
      const solicitud = ruta.request().postDataJSON() as {
        ventaId?: string;
        tipo?: string;
      };
      expect(solicitud.ventaId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(solicitud.tipo).toBe("boleta");
      await ruta.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          comprobanteId: randomUUID(),
          estado: "emitido",
          aceptadaPorSunat: null,
        }),
      });
    });
    const alta = page.getByRole("button", { name: "Nueva venta" });
    await expect(alta).toBeVisible({ timeout: 1000 });
    await alta.click();
    const nuevaVenta = page.getByRole("dialog", { name: "Nueva venta" });
    await nuevaVenta.getByRole("radio", { name: "Boleta simple" }).check();
    await page.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(
      nuevaVenta.getByText(
        "Agrega al menos un producto para guardar el borrador.",
      ),
    ).toBeVisible();

    const busquedaProducto = nuevaVenta.getByRole("combobox", {
      name: "Producto",
    });
    await busquedaProducto.fill(sku);
    await nuevaVenta.getByRole("option", { name: new RegExp(nombre) }).click();
    await nuevaVenta.getByLabel("Cantidad").fill("1");
    await nuevaVenta.getByRole("button", { name: "Agregar producto" }).click();
    await nuevaVenta.getByRole("button", { name: "Guardar borrador" }).click();

    const borrador = page
      .getByRole("row", { name: /Borrador/ })
      .filter({ hasText: "Venta de mostrador" });
    await expect(borrador).toContainText("S/ 10.00");
    await borrador.getByRole("button", { name: "Editar borrador" }).click();
    await page.getByLabel("Cantidad de producto 1").fill("2");
    await page.getByRole("button", { name: "Guardar cambios" }).click();

    const actualizado = page
      .getByRole("row", { name: /Borrador/ })
      .filter({ hasText: "Venta de mostrador" });
    await expect(actualizado).toContainText("S/ 20.00");
    await actualizado.getByRole("button", { name: "Confirmar venta" }).click();
    const confirmacion = page.getByRole("dialog", {
      name: "Confirmar venta y emitir comprobante",
    });
    await confirmacion
      .getByRole("button", { name: "Confirmar y enviar" })
      .click();
    await expect(
      page.getByText(
        "Venta confirmada y boleta enviada a NubeFacT. La aceptación de SUNAT se consultará después.",
      ),
    ).toBeVisible();
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: "Venta de mostrador" })
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
    const filaReporte = page.getByRole("row").filter({ hasText: nombre });
    await expect(
      filaReporte.getByRole("cell", { name: "S/ 20.00" }),
    ).toBeVisible();
    await page.getByLabel("Desde").fill("2020-01-01");
    await page.getByLabel("Hasta").fill("2020-01-31");
    await page.getByRole("button", { name: "Aplicar periodo" }).click();
    await expect(
      page.getByText("Aún no hay ventas en este periodo"),
    ).toBeVisible();

    const contextoVendedor = await browser.newContext();
    try {
      const paginaVendedor = await contextoVendedor.newPage();
      await iniciarSesion(paginaVendedor, usuarios.vendedor);
      await paginaVendedor.goto("/panel/reportes");
      await expect(
        paginaVendedor.getByRole("heading", { name: "Reportes" }),
      ).toBeVisible();
      await expect(
        paginaVendedor.getByText("Aún no hay ventas en este periodo"),
      ).toBeVisible();
    } finally {
      await contextoVendedor.close();
    }
  } finally {
    await restaurarConfiguracion();
  }
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

  await page.goto("/panel/ventas");
  await page.getByRole("button", { name: "Nueva venta" }).click();
  const nuevaVenta = page.getByRole("dialog", { name: "Nueva venta" });
  await nuevaVenta.getByRole("radio", { name: "Boleta simple" }).check();
  const busquedaProducto = nuevaVenta.getByRole("combobox", {
    name: "Producto",
  });
  await busquedaProducto.fill(sku);
  await nuevaVenta.getByRole("option", { name: new RegExp(nombre) }).click();
  await page.getByLabel("Cantidad").fill("2");
  await page.getByRole("button", { name: "Agregar producto" }).click();
  await page.getByRole("button", { name: "Guardar borrador" }).click();

  const borrador = page
    .getByRole("row", { name: /Borrador/ })
    .filter({ hasText: "Venta de mostrador" });
  await expect(borrador).toContainText("S/ 20.00");
  await borrador.getByRole("button", { name: "Descartar borrador" }).click();
  const confirmacion = page.getByRole("dialog", {
    name: "¿Descartar este borrador?",
  });
  await confirmacion.getByRole("button", { name: "Seguir editando" }).click();
  await expect(borrador).toContainText("Borrador");

  await borrador.getByRole("button", { name: "Descartar borrador" }).click();
  await page
    .getByRole("dialog", { name: "¿Descartar este borrador?" })
    .getByRole("button", { name: "Descartar borrador" })
    .click();
  await expect(
    page
      .getByRole("row", { name: /Descartada/ })
      .filter({ hasText: "Venta de mostrador" })
      .filter({ hasText: "S/ 20.00" }),
  ).toContainText("S/ 20.00");
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

async function prepararRucTemporal(): Promise<() => Promise<void>> {
  const supabase = crearClienteAdministradorLocal();
  const { data: empresa, error: errorConsulta } = await supabase
    .from("empresa")
    .select("ruc")
    .eq("unica", true)
    .single();
  if (errorConsulta) {
    throw new Error("No se pudo leer la empresa local de prueba.");
  }

  const { error: errorRuc } = await supabase
    .from("empresa")
    .update({ ruc: "10761854777" })
    .eq("unica", true);
  if (errorRuc) {
    throw new Error("No se pudo preparar el RUC local para la prueba.");
  }

  let serieTemporalId: string | null = null;
  try {
    const { data: serieActiva, error: errorSerie } = await supabase
      .from("series_comprobante")
      .select("id")
      .eq("tipo", "boleta")
      .eq("activa", true)
      .maybeSingle();
    if (errorSerie) {
      throw new Error("No se pudo revisar la serie de boleta local.");
    }
    if (!serieActiva) {
      const { data: serieCreada, error: errorCreacion } = await supabase
        .from("series_comprobante")
        .insert({
          tipo: "boleta",
          serie: `B${randomUUID().replaceAll("-", "").slice(0, 3).toUpperCase()}`,
          actualizado_por: usuarios.administrador.id,
        })
        .select("id")
        .single();
      if (errorCreacion) {
        throw new Error("No se pudo preparar la serie de boleta local.");
      }
      serieTemporalId = serieCreada.id;
    }
  } catch (error) {
    await supabase
      .from("empresa")
      .update({ ruc: empresa.ruc })
      .eq("unica", true);
    throw error;
  }

  return async () => {
    const errores: string[] = [];
    if (serieTemporalId) {
      const { error } = await supabase
        .from("series_comprobante")
        .delete()
        .eq("id", serieTemporalId);
      if (error) errores.push("No se pudo borrar la serie temporal.");
    }
    const { error } = await supabase
      .from("empresa")
      .update({ ruc: empresa.ruc })
      .eq("unica", true);
    if (error) errores.push("No se pudo restaurar el RUC original.");
    if (errores.length) throw new Error(errores.join(" "));
  };
}
