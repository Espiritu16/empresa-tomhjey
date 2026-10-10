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

test("administra roles e invita a un vendedor con validación de correo", async ({
  page,
  browser,
}) => {
  await iniciarSesion(page, administrador);
  await page.goto("/panel/usuarios");
  const invitar = page.getByRole("button", { name: "Invitar vendedor" });
  await expect(invitar).toBeVisible({ timeout: 1000 });
  const vendedor = page.getByRole("row", { name: /Vendedor E2E/ });
  await expect(vendedor).toContainText("Activo");
  await vendedor
    .getByRole("button", { name: "Desactivar Vendedor E2E" })
    .click();
  await expect(vendedor).toContainText("Inactivo");
  await vendedor.getByRole("button", { name: "Activar Vendedor E2E" }).click();
  await expect(vendedor).toContainText("Activo");
  await invitar.click();
  await page.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(page.getByLabel("Correo electrónico")).toHaveJSProperty(
    "validity.valueMissing",
    true,
  );

  const correo = `e2e-invitado-${identificadorE2E}-${randomUUID()}@example.com`;
  await page.getByLabel("Correo electrónico").fill(correo);
  await page.getByRole("button", { name: "Enviar invitación" }).click();
  await expect(page.getByText("La invitación se envió.")).toBeVisible();
  await expect(
    page.getByRole("row", { name: new RegExp(correo) }),
  ).toContainText("Pendiente");

  const invitacion = await obtenerEnlaceInvitacion(page, correo);
  const contextoInvitado = await browser.newContext();
  const paginaInvitado = await contextoInvitado.newPage();
  await paginaInvitado.goto(invitacion);
  await expect(
    paginaInvitado.getByRole("heading", { name: "Activa tu cuenta" }),
  ).toBeVisible();
  const clave = `Invitado-E2E-${randomUUID().slice(0, 8)}`;
  await paginaInvitado.getByLabel("Nueva contraseña").fill(clave);
  await paginaInvitado.getByLabel("Repite la contraseña").fill(clave);
  await paginaInvitado.getByRole("button", { name: "Activar cuenta" }).click();
  await expect(paginaInvitado).toHaveURL(/\/panel$/);
  await expect(
    paginaInvitado.getByRole("link", { name: "Usuarios", exact: true }),
  ).toHaveCount(0);

  const supabaseLocal = crearClienteAdministradorLocal();
  const { data: cuentas, error: errorCuentas } =
    await supabaseLocal.auth.admin.listUsers();
  expect(errorCuentas).toBeNull();
  const cuentaInvitada = cuentas.users.find(
    (usuario) => usuario.email?.toLowerCase() === correo.toLowerCase(),
  );
  expect(cuentaInvitada).toBeTruthy();
  const [{ data: perfil }, { data: invitacionGuardada }] = await Promise.all([
    supabaseLocal
      .from("perfiles")
      .select("id, rol, activo")
      .eq("id", cuentaInvitada!.id)
      .maybeSingle(),
    supabaseLocal
      .from("invitaciones")
      .select("estado, perfil_id")
      .eq("correo", correo.toLowerCase())
      .maybeSingle(),
  ]);
  expect(perfil).toMatchObject({ rol: "vendedor", activo: true });
  expect(invitacionGuardada).toMatchObject({
    estado: "aceptada",
    perfil_id: cuentaInvitada!.id,
  });
  await paginaInvitado.getByRole("button", { name: "Salir" }).click();
  await iniciarSesion(paginaInvitado, { ...administrador, correo, clave });
  await expect(
    paginaInvitado.getByRole("heading", { name: "Inicio" }),
  ).toBeVisible();
  await expect(
    paginaInvitado.getByRole("link", { name: "Usuarios", exact: true }),
  ).toHaveCount(0);
  await contextoInvitado.close();
});

async function obtenerEnlaceInvitacion(
  page: Page,
  correo: string,
): Promise<string> {
  let idMensaje: string | null = null;
  await expect
    .poll(
      async () => {
        const respuesta = await page.request.get(
          "http://127.0.0.1:54324/api/v1/messages?limit=100",
        );
        if (!respuesta.ok()) return null;
        const lista = (await respuesta.json()) as {
          messages: { ID: string; To: { Address: string }[] }[];
        };
        idMensaje =
          lista.messages.find((mensaje) =>
            mensaje.To.some(
              (destinatario) =>
                destinatario.Address.toLowerCase() === correo.toLowerCase(),
            ),
          )?.ID ?? null;
        return idMensaje;
      },
      { message: "Supabase local debe entregar el correo de invitación" },
    )
    .toBeTruthy();

  const detalle = await page.request.get(
    `http://127.0.0.1:54324/api/v1/message/${idMensaje}`,
  );
  expect(detalle.ok()).toBeTruthy();
  const mensaje = (await detalle.json()) as { HTML: string };
  const href = mensaje.HTML.match(/href="([^"]+)"/i)?.[1];
  expect(href).toBeTruthy();
  return href!.replaceAll("&amp;", "&");
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
