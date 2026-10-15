import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { EstadoE2E } from "./configuracion/preparar";
import { crearClienteAdministradorLocal } from "./configuracion/supabase-local";

let administrador: EstadoE2E["administrador"];

test.beforeAll(async () => {
  const rutaEstado = process.env.EMPRESA_TOMHJEY_E2E_ESTADO;
  if (!rutaEstado)
    throw new Error("Falta el estado temporal de las pruebas E2E.");
  const estado = JSON.parse(await readFile(rutaEstado, "utf8")) as EstadoE2E;
  administrador = estado.administrador;
});

test("muestra los flujos de factura y boleta y bloquea emisión sin datos fiscales", async ({
  page,
}) => {
  await conConfiguracionFiscalTemporal(async () => {
    await iniciarSesion(page, administrador);
    await page.goto("/panel/facturacion");
    await expect(
      page.getByRole("heading", { name: "Facturación" }),
    ).toBeVisible();
    await expect(page.getByText("Falta el RUC de la empresa")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Serie de factura" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Serie de boleta" }),
    ).toBeVisible();
    const ventasFacturables = page.getByRole("button", {
      name: "Emitir factura",
    });
    await expect(ventasFacturables).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Emitir boleta" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Guardar serie" }),
    ).toHaveCount(2);
  }, null);
});

test("confirma una boleta simple sin cliente y deja pendiente la consulta a SUNAT", async ({
  page,
}) => {
  await conConfiguracionFiscalTemporal(async () => {
    await iniciarSesion(page, administrador);
    const identificador = `E2E-BOLETA-${randomUUID().slice(0, 8)}`;
    const nombreProducto = `Producto ${identificador}`;

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

    await page.goto("/panel/productos");
    await page.getByRole("button", { name: "Nuevo producto" }).click();
    await page.getByLabel("SKU").fill(identificador);
    await page.getByLabel("Nombre del producto").fill(nombreProducto);
    await page.getByLabel("Precio unitario").fill("10");
    await page.getByLabel("Existencias iniciales").fill("5");
    await page.getByRole("button", { name: "Guardar producto" }).click();

    await page.goto("/panel/ventas");
    await page.getByRole("button", { name: "Nueva venta" }).click();
    const dialogoVenta = page.getByRole("dialog", { name: "Nueva venta" });
    await dialogoVenta.getByRole("radio", { name: "Boleta simple" }).check();
    await expect(
      dialogoVenta.getByRole("combobox", { name: "Cliente" }),
    ).toHaveCount(0);
    const busquedaProducto = dialogoVenta.getByRole("combobox", {
      name: "Producto",
    });
    await busquedaProducto.fill(identificador);
    await dialogoVenta
      .getByRole("option", { name: new RegExp(nombreProducto) })
      .click();
    await dialogoVenta.getByLabel("Cantidad").fill("2");
    await dialogoVenta
      .getByRole("button", { name: "Agregar producto" })
      .click();
    await expect(
      dialogoVenta.getByText(
        "Se emitirá sin asignar cliente para totales menores de S/ 700. Desde S/ 700 exactos, se requiere identificar al comprador: cambia a Boleta y selecciona un cliente con DNI antes de confirmar.",
      ),
    ).toBeVisible();
    await dialogoVenta
      .getByRole("button", { name: "Guardar borrador" })
      .click();

    const borrador = page.getByRole("row", { name: /Borrador/ }).first();
    await expect(borrador).toContainText("Venta de mostrador");
    await borrador.getByRole("button", { name: "Confirmar venta" }).click();
    await expect(
      page.getByText("Se enviará como Boleta simple."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmar y enviar" }).click();

    await expect(
      page.getByText(
        "Venta confirmada y boleta enviada a NubeFacT. La aceptación de SUNAT se consultará después.",
      ),
    ).toBeVisible();

    await page.goto("/panel/inventario");
    await expect(
      page
        .getByRole("table")
        .first()
        .getByRole("row", { name: new RegExp(identificador) }),
    ).toContainText("3 NIU");
    await page.screenshot({
      path: "artifacts/e2e/boleta-simple-respuesta-simulada.png",
      fullPage: true,
    });
  });
});

test("consulta una boleta desde su emisión y una factura pendiente sin reemitir", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  const supabase = crearClienteAdministradorLocal();
  const sufijo = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const { data: cliente, error: errorCliente } = await supabase
    .from("clientes")
    .insert({
      tipo_documento: "ruc",
      numero_documento: "20100066603",
      nombre: `Cliente consulta ${sufijo}`,
      creado_por: administrador.id,
    })
    .select("id")
    .single();
  if (errorCliente || !cliente) {
    throw new Error("No se pudo crear el cliente temporal de la prueba.");
  }

  const { data: venta, error: errorVenta } = await supabase
    .from("ventas")
    .insert({
      cliente_id: cliente.id,
      cliente_nombre: `Cliente consulta ${sufijo}`,
      cliente_tipo_documento: "ruc",
      cliente_numero_documento: "20100066603",
      estado: "confirmada",
      moneda: "PEN",
      subtotal: 100,
      igv: 0,
      total: 100,
      creado_por: administrador.id,
      confirmado_por: administrador.id,
      confirmado_en: new Date().toISOString(),
      tipo_comprobante: "factura",
    })
    .select("id")
    .single();
  if (errorVenta || !venta) {
    throw new Error("No se pudo crear la venta temporal de la prueba.");
  }

  const serie = `F${sufijo.slice(0, 3)}`;
  const numero = Number.parseInt(sufijo.slice(3), 16) + 1;
  const { error: errorComprobante } = await supabase
    .from("comprobantes")
    .insert({
      venta_id: venta.id,
      tipo: "factura",
      serie,
      numero,
      estado: "emitido",
      payload: {
        operacion: "generar_comprobante",
        tipo_de_comprobante: 1,
        serie,
        numero,
        total: 100,
      },
      respuesta_proveedor: { aceptada_por_sunat: false },
      respuesta_consulta_sunat: { aceptada_por_sunat: false },
      consultado_sunat_en: new Date().toISOString(),
      solicitado_por: administrador.id,
      intentos: 1,
    });
  if (errorComprobante) {
    throw new Error("No se pudo crear la factura temporal de la prueba.");
  }

  const ventaAceptada = await crearVentaDeConsultaTemporal(
    supabase,
    administrador.id,
    cliente.id,
    `Cliente consulta aceptada ${sufijo}`,
    "factura",
  );
  const serieAceptada = `F${randomUUID().replaceAll("-", "").slice(0, 3).toUpperCase()}`;
  const { data: comprobanteAceptado, error: errorAceptada } = await supabase
    .from("comprobantes")
    .insert({
      venta_id: ventaAceptada,
      tipo: "factura",
      serie: serieAceptada,
      numero: 1,
      estado: "emitido",
      payload: { operacion: "generar_comprobante", tipo_de_comprobante: 1 },
      respuesta_proveedor: { aceptada_por_sunat: true },
      solicitado_por: administrador.id,
      intentos: 1,
    })
    .select("id")
    .single();
  if (errorAceptada || !comprobanteAceptado) {
    throw new Error("No se pudo crear la factura aceptada temporal.");
  }

  const dniBoleta = String(
    10_000_000 + Number.parseInt(randomUUID().slice(0, 6), 16),
  );
  const { data: clienteBoleta, error: errorClienteBoleta } = await supabase
    .from("clientes")
    .insert({
      tipo_documento: "dni",
      numero_documento: dniBoleta,
      nombre: `Cliente boleta pendiente ${sufijo}`,
      creado_por: administrador.id,
    })
    .select("id")
    .single();
  if (errorClienteBoleta || !clienteBoleta) {
    throw new Error("No se pudo crear el cliente DNI temporal de la prueba.");
  }

  const ventaBoleta = await crearVentaDeConsultaTemporal(
    supabase,
    administrador.id,
    clienteBoleta.id,
    `Cliente boleta pendiente ${sufijo}`,
    "boleta",
    "dni",
    dniBoleta,
  );
  const serieBoleta = `B${randomUUID().replaceAll("-", "").slice(0, 3).toUpperCase()}`;
  const { data: comprobanteBoleta, error: errorBoleta } = await supabase
    .from("comprobantes")
    .insert({
      venta_id: ventaBoleta,
      tipo: "boleta",
      serie: serieBoleta,
      numero: 1,
      estado: "emitido",
      consulta_sunat_desde: new Date().toISOString(),
      respuesta_consulta_sunat: { aceptada_por_sunat: false },
      consultado_sunat_en: new Date().toISOString(),
      payload: { operacion: "generar_comprobante", tipo_de_comprobante: 2 },
      respuesta_proveedor: { aceptada_por_sunat: false },
      solicitado_por: administrador.id,
      intentos: 1,
    })
    .select("id")
    .single();
  if (errorBoleta || !comprobanteBoleta) {
    throw new Error("No se pudo crear la boleta pendiente temporal.");
  }

  let consultas = 0;
  let consultasBoleta = 0;
  await page.route("**/functions/v1/facturacion", async (ruta) => {
    const solicitud = ruta.request().postDataJSON() as {
      operacion?: string;
      comprobanteId?: string;
      ventaId?: string;
    };
    expect(solicitud.comprobanteId).toBeTruthy();
    expect(solicitud.ventaId).toBeUndefined();
    if (solicitud.operacion === "consultar_boleta") {
      consultasBoleta += 1;
    } else {
      expect(solicitud.operacion).toBe("consultar_factura");
      consultas += 1;
    }
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        encontrada: solicitud.operacion === "consultar_factura",
        aceptadaPorSunat: solicitud.operacion === "consultar_factura",
      }),
    });
  });

  await page.goto("/panel/ventas");
  const ventaAceptadaEnVentas = page
    .getByRole("row")
    .filter({ hasText: `Cliente consulta aceptada ${sufijo}` });
  await expect(
    ventaAceptadaEnVentas.getByRole("link", {
      name: "Consultar comprobante",
    }),
  ).toHaveAttribute(
    "href",
    `/panel/facturacion#comprobante-${comprobanteAceptado.id}`,
  );
  const boletaEnVentas = page
    .getByRole("row")
    .filter({ hasText: `Cliente boleta pendiente ${sufijo}` });
  const enlaceConsultaBoleta = boletaEnVentas.getByRole("link", {
    name: "Consultar comprobante",
  });
  await expect(enlaceConsultaBoleta).toHaveAttribute(
    "href",
    `/panel/facturacion#comprobante-${comprobanteBoleta.id}`,
  );
  await enlaceConsultaBoleta.click();
  await expect(page).toHaveURL(
    new RegExp(`/panel/facturacion#comprobante-${comprobanteBoleta.id}`),
  );
  const filaBoletaEnFacturacion = page.locator(
    `#comprobante-${comprobanteBoleta.id}`,
  );
  await expect(
    filaBoletaEnFacturacion.getByRole("button", {
      name: "Consultar comprobante",
    }),
  ).toBeVisible();
  const botonConsultaBoleta = filaBoletaEnFacturacion.getByRole("button", {
    name: "Consultar comprobante",
  });
  await expect(botonConsultaBoleta).toBeEnabled();
  await botonConsultaBoleta.click();
  await expect(
    page.getByText(
      "NubeFacT aún no encuentra la boleta. Sigue pendiente; puedes volver a consultar cuando quieras.",
    ),
  ).toBeVisible();
  await expect(botonConsultaBoleta).toBeEnabled();
  await botonConsultaBoleta.click();
  await expect.poll(() => consultasBoleta).toBe(2);

  await page.goto("/panel/facturacion");
  const fila = page.getByRole("row").filter({ hasText: `${serie}-` });
  await expect(
    fila.getByRole("button", { name: "Consultar comprobante" }),
  ).toBeVisible();
  await fila.getByRole("button", { name: "Consultar comprobante" }).click();
  await expect(
    page.getByText(
      `La factura de Cliente consulta ${sufijo} fue aceptada por SUNAT.`,
    ),
  ).toBeVisible();
  await expect(
    fila.getByRole("button", { name: "Consultar comprobante" }),
  ).toBeEnabled();
  await fila.getByRole("button", { name: "Consultar comprobante" }).click();
  await expect.poll(() => consultas).toBe(2);

  await page.goto("/panel/facturacion");
  const filaAceptada = page.getByRole("row").filter({
    hasText: `${serieAceptada}-00000001`,
  });
  await expect(
    filaAceptada.getByRole("button", { name: "Consultar comprobante" }),
  ).toBeVisible();
  await expect(
    filaAceptada.getByRole("button", { name: "Consultar comprobante" }),
  ).toBeDisabled();

  const filaBoleta = page.getByRole("row").filter({
    hasText: `${serieBoleta}-00000001`,
  });
  await expect(
    filaBoleta.getByRole("button", { name: "Consultar comprobante" }),
  ).toBeVisible();
  await expect(
    filaBoleta.getByRole("button", { name: "Consultar comprobante" }),
  ).toBeEnabled();
});

async function crearVentaDeConsultaTemporal(
  supabase: ReturnType<typeof crearClienteAdministradorLocal>,
  usuarioId: string,
  clienteId: string,
  clienteNombre: string,
  tipo: "factura" | "boleta",
  clienteTipoDocumento = "ruc",
  clienteNumeroDocumento = "20100066603",
): Promise<string> {
  const { data, error } = await supabase
    .from("ventas")
    .insert({
      cliente_id: clienteId,
      cliente_nombre: clienteNombre,
      cliente_tipo_documento: clienteTipoDocumento,
      cliente_numero_documento: clienteNumeroDocumento,
      estado: "confirmada",
      moneda: "PEN",
      subtotal: 100,
      igv: 0,
      total: 100,
      creado_por: usuarioId,
      confirmado_por: usuarioId,
      confirmado_en: new Date().toISOString(),
      tipo_comprobante: tipo,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error("No se pudo crear la venta temporal de consulta.");
  }
  return data.id;
}

test("exige identificar al cliente desde S/ 700 exactos", async ({ page }) => {
  await conConfiguracionFiscalTemporal(async () => {
    await iniciarSesion(page, administrador);
    const identificador = `E2E-LIMITE-${randomUUID().slice(0, 8)}`;
    const nombreProducto = `Producto ${identificador}`;
    await page.goto("/panel/productos");
    await page.getByRole("button", { name: "Nuevo producto" }).click();
    await page.getByLabel("SKU").fill(identificador);
    await page.getByLabel("Nombre del producto").fill(nombreProducto);
    await page.getByLabel("Precio unitario").fill("700");
    await page.getByLabel("Existencias iniciales").fill("1");
    await page.getByRole("button", { name: "Guardar producto" }).click();

    await page.goto("/panel/ventas");
    await page.getByRole("button", { name: "Nueva venta" }).click();
    const dialogo = page.getByRole("dialog", { name: "Nueva venta" });
    await dialogo.getByRole("radio", { name: "Boleta simple" }).check();
    const busquedaProducto = dialogo.getByRole("combobox", {
      name: "Producto",
    });
    await busquedaProducto.fill(identificador);
    await dialogo
      .getByRole("option", { name: new RegExp(nombreProducto) })
      .click();
    await dialogo.getByLabel("Cantidad").fill("1");
    await dialogo.getByRole("button", { name: "Agregar producto" }).click();
    await dialogo.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(
      page
        .getByRole("complementary", { name: "Notificaciones" })
        .getByRole("alert"),
    ).toHaveText("Las boletas desde S/ 700 requieren identificar al cliente.");
  });
});

async function conConfiguracionFiscalTemporal(
  tarea: () => Promise<void>,
  rucTemporal: string | null = "20100066603",
): Promise<void> {
  const supabase = crearClienteAdministradorLocal();
  const { data: empresa, error: errorConsulta } = await supabase
    .from("empresa")
    .select("ruc")
    .eq("unica", true)
    .single();
  if (errorConsulta) {
    throw new Error(
      "No se pudo preparar el RUC temporal para la prueba local.",
    );
  }

  const { error: errorActualizacion } = await supabase
    .from("empresa")
    .update({ ruc: rucTemporal })
    .eq("unica", true);
  if (errorActualizacion) {
    throw new Error(
      "No se pudo preparar el RUC temporal para la prueba local.",
    );
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
      const { data: serieCreada, error: errorCreacionSerie } = await supabase
        .from("series_comprobante")
        .insert({
          tipo: "boleta",
          serie: `B${randomUUID().replaceAll("-", "").slice(0, 3).toUpperCase()}`,
          actualizado_por: administrador.id,
        })
        .select("id")
        .single();
      if (errorCreacionSerie) {
        throw new Error("No se pudo preparar una serie de boleta local.");
      }
      serieTemporalId = serieCreada.id;
    }

    await tarea();
  } finally {
    const erroresLimpieza: string[] = [];
    if (serieTemporalId) {
      const { error: errorBorradoSerie } = await supabase
        .from("series_comprobante")
        .delete()
        .eq("id", serieTemporalId);
      if (errorBorradoSerie) {
        erroresLimpieza.push("No se pudo limpiar la serie temporal de boleta.");
      }
    }
    const { error: errorRestauracion } = await supabase
      .from("empresa")
      .update({ ruc: empresa.ruc })
      .eq("unica", true);
    if (errorRestauracion) {
      erroresLimpieza.push(
        "No se pudo restaurar el RUC original de la empresa local.",
      );
    }
    if (erroresLimpieza.length) {
      throw new Error(erroresLimpieza.join(" "));
    }
  }
}

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
