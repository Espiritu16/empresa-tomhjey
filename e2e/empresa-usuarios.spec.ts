import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { EstadoE2E } from "./configuracion/preparar";
import { crearClienteAdministradorLocal } from "./configuracion/supabase-local";

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

test("guarda la configuración comercial y el servidor rechaza un RUC inválido", async ({
  page,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/empresa");
  await expect(
    page.getByRole("heading", { name: "Empresa y configuración" }),
  ).toBeVisible({ timeout: 1000 });
  await page.getByLabel("Nombre de la empresa").fill("Empresa E2E configurada");
  await page.getByRole("button", { name: "Guardar empresa" }).click();
  await expect(
    page.getByText("La configuración de empresa se guardó."),
  ).toBeVisible();
  await page.getByLabel("RUC").fill("20100066604");
  await page.getByRole("button", { name: "Guardar empresa" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "El RUC no es válido." }).first(),
  ).toBeVisible();
});

test("el administrador crea usuarios localmente con cualquiera de los dos roles, sin correo", async ({
  page,
  browser,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/usuarios");
  const crear = page.getByRole("button", { name: "Nuevo usuario" });
  await expect(crear).toBeVisible({ timeout: 1000 });
  const vendedor = page.getByRole("row", { name: /Vendedor E2E/ });
  await expect(vendedor).toContainText("Activo");
  await vendedor
    .getByRole("button", { name: "Desactivar Vendedor E2E" })
    .click();
  await expect(vendedor).toContainText("Inactivo");
  await vendedor.getByRole("button", { name: "Activar Vendedor E2E" }).click();
  await expect(vendedor).toContainText("Activo");

  const correoVendedor = `e2e-vendedor-${identificadorE2E}-${randomUUID()}@example.com`;
  const claveVendedor = `Vendedor-E2E-${randomUUID().slice(0, 8)}`;
  await crear.click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByRole("button", { name: "Crear usuario" }).click();
  await expect(dialogo.getByLabel("Nombre completo")).toHaveJSProperty(
    "validity.valueMissing",
    true,
  );
  await dialogo.getByLabel("Nombre completo").fill("Vendedor directo E2E");
  await dialogo.getByLabel("Correo electrónico").fill(correoVendedor);
  await dialogo.getByLabel("Contraseña inicial").fill(claveVendedor);
  await dialogo.getByLabel("Rol").selectOption("vendedor");
  await dialogo.getByRole("button", { name: "Crear usuario" }).click();
  await expect(
    page.getByText(
      `La cuenta ${correoVendedor} se creó. Comparte la contraseña inicial con la persona.`,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: new RegExp(correoVendedor) }),
  ).toContainText("Vendedor");
  await expect(
    page.getByRole("row", { name: new RegExp(correoVendedor) }),
  ).toContainText("Activo");
  await expectNoSeEnvioCorreo(page, correoVendedor);

  const contextoVendedor = await browser.newContext();
  const paginaVendedor = await contextoVendedor.newPage();
  await iniciarSesion(paginaVendedor, {
    id: "",
    correo: correoVendedor,
    clave: claveVendedor,
  });
  await expect(
    paginaVendedor.getByRole("link", { name: "Usuarios", exact: true }),
  ).toHaveCount(0);
  await expect(
    paginaVendedor.getByRole("link", { name: "Empresa", exact: true }),
  ).toHaveCount(0);
  await expect(
    paginaVendedor.getByRole("link", { name: "Ventas", exact: true }),
  ).toBeVisible();
  await expect(
    paginaVendedor.getByRole("link", { name: "Productos", exact: true }),
  ).toBeVisible();
  await expect(
    paginaVendedor.getByRole("link", { name: "Asistente IA", exact: true }),
  ).toBeVisible();

  await paginaVendedor.goto("/panel/empresa");
  await expect(paginaVendedor).toHaveURL(/\/panel$/);
  await paginaVendedor.goto("/panel/usuarios");
  await expect(paginaVendedor).toHaveURL(/\/panel$/);

  await paginaVendedor.goto("/panel/productos");
  await expect(
    paginaVendedor.getByRole("button", { name: "Nuevo producto" }),
  ).toBeVisible();
  await expect(
    paginaVendedor.getByRole("button", { name: "Nueva categoría" }),
  ).toHaveCount(0);
  await paginaVendedor.getByRole("button", { name: "Nuevo producto" }).click();
  const formularioProducto = paginaVendedor.getByRole("dialog");
  await expect(
    formularioProducto.getByLabel("Existencias iniciales"),
  ).toHaveCount(0);
  const skuProducto = `E2E-${identificadorE2E.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
  await formularioProducto.getByLabel("SKU").fill(skuProducto);
  await formularioProducto
    .getByLabel("Nombre del producto")
    .fill("Producto de vendedor E2E");
  await formularioProducto.getByLabel("Precio unitario").fill("18.50");
  await formularioProducto.getByLabel("Stock mínimo").fill("2");
  await formularioProducto
    .getByRole("button", { name: "Guardar producto" })
    .click();
  let filaProducto = paginaVendedor.getByRole("row", { name: skuProducto });
  await expect(filaProducto).toContainText("Producto de vendedor E2E");

  await filaProducto
    .getByRole("button", { name: "Editar Producto de vendedor E2E" })
    .click();
  const formularioEdicion = paginaVendedor.getByRole("dialog");
  await formularioEdicion
    .getByLabel("Nombre del producto")
    .fill("Producto actualizado E2E");
  await formularioEdicion
    .getByRole("button", { name: "Guardar cambios" })
    .click();
  filaProducto = paginaVendedor.getByRole("row", { name: skuProducto });
  await expect(filaProducto).toContainText("Producto actualizado E2E");
  await filaProducto
    .getByRole("button", { name: "Inactivar Producto actualizado E2E" })
    .click();
  await expect(filaProducto).toContainText("Inactivo");
  await contextoVendedor.close();

  const correoAdmin = `e2e-admin-${identificadorE2E}-${randomUUID()}@example.com`;
  const claveAdmin = `Admin-E2E-${randomUUID().slice(0, 8)}`;
  await crear.click();
  await dialogo.getByLabel("Nombre completo").fill("Administrador directo E2E");
  await dialogo.getByLabel("Correo electrónico").fill(correoAdmin);
  await dialogo.getByLabel("Contraseña inicial").fill(claveAdmin);
  await dialogo.getByLabel("Rol").selectOption("administrador");
  await dialogo.getByRole("button", { name: "Crear usuario" }).click();
  await expect(
    page.getByText(
      `La cuenta ${correoAdmin} se creó. Comparte la contraseña inicial con la persona.`,
    ),
  ).toBeVisible();
  await expectNoSeEnvioCorreo(page, correoAdmin);

  const supabaseLocal = crearClienteAdministradorLocal();
  const { data: cuentas, error: errorCuentas } =
    await supabaseLocal.auth.admin.listUsers();
  expect(errorCuentas).toBeNull();
  const cuentaVendedor = cuentas.users.find(
    (usuario) => usuario.email?.toLowerCase() === correoVendedor.toLowerCase(),
  );
  const cuentaAdmin = cuentas.users.find(
    (usuario) => usuario.email?.toLowerCase() === correoAdmin.toLowerCase(),
  );
  expect(cuentaVendedor).toBeTruthy();
  expect(cuentaAdmin).toBeTruthy();
  const [{ data: perfilVendedor }, { data: perfilAdmin }] = await Promise.all([
    supabaseLocal
      .from("perfiles")
      .select("id, correo, rol, activo")
      .eq("id", cuentaVendedor!.id)
      .single(),
    supabaseLocal
      .from("perfiles")
      .select("id, correo, rol, activo")
      .eq("id", cuentaAdmin!.id)
      .single(),
  ]);
  expect(perfilVendedor).toMatchObject({
    rol: "vendedor",
    activo: true,
    correo: correoVendedor,
  });
  expect(perfilAdmin).toMatchObject({
    rol: "administrador",
    activo: true,
    correo: correoAdmin,
  });

  const contextoAdmin = await browser.newContext();
  const paginaAdmin = await contextoAdmin.newPage();
  await iniciarSesion(paginaAdmin, {
    id: "",
    correo: correoAdmin,
    clave: claveAdmin,
  });
  await expect(
    paginaAdmin.getByRole("link", { name: "Usuarios", exact: true }),
  ).toBeVisible();
  await paginaAdmin.goto("/panel/productos");
  await expect(
    paginaAdmin.getByRole("button", { name: "Nuevo producto" }),
  ).toBeVisible();
  await contextoAdmin.close();
});

async function expectNoSeEnvioCorreo(
  page: Page,
  correo: string,
): Promise<void> {
  const respuesta = await page.request.get(
    "http://127.0.0.1:54324/api/v1/messages?limit=100",
  );
  expect(respuesta.ok()).toBeTruthy();
  const lista = (await respuesta.json()) as {
    messages: { To: { Address: string }[] }[];
  };
  expect(
    lista.messages.some((mensaje) =>
      mensaje.To.some(
        (destinatario) =>
          destinatario.Address.toLowerCase() === correo.toLowerCase(),
      ),
    ),
  ).toBe(false);
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
