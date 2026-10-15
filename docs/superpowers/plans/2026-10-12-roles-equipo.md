# Gestión directa de usuarios — Empresa Tomhjey

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un administrador cree cuentas de Administrador o Vendedor desde Usuarios, sin invitaciones ni envío de correos.

**Architecture:** La pantalla envía nombre, correo, contraseña inicial y rol a una Edge Function. Esta autentica la sesión, verifica el rol en `perfiles` y usa Auth Admin API para crear una cuenta con correo confirmado. El trigger crea inicialmente un perfil Vendedor; la función privilegiada asigna el rol solicitado únicamente después de comprobar al administrador. Los permisos siguen dependiendo de `perfiles`, nunca de `user_metadata`.

**Tech Stack:** Next.js 16, TypeScript, Supabase PostgreSQL 17, Auth, Edge Functions, pgTAP y Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-empresa-tomhjey-design.md`

## Global Constraints

- Los únicos roles son `administrador` y `vendedor`; `perfiles` es su fuente de verdad.
- No uses `user_metadata` para decisiones de autorización; los permisos vienen de `perfiles`.
- Solo un administrador autenticado puede crear cuentas o activar/desactivar vendedores.
- La persona administradora ingresa la contraseña inicial; el MVP no envía correo.
- Cada cambio estructural se agrega como migración nueva; pruebas pgTAP en `supabase/tests/`.
- Las pruebas E2E corren contra Supabase y la aplicación locales.

---

### Task 1: Crear cuentas sin flujo de invitación

**Files:** nueva migración Supabase; `supabase/tests/operaciones_mvp.test.sql`; nuevo `supabase/functions/crear-usuario/index.ts`; retirar `supabase/functions/invitar-vendedor/`.

- [x] Eliminar el flujo de invitación del esquema ejecutable: RPCs, asociación del trigger de Auth y trigger de aceptación. Mantener intactos los registros históricos de la tabla `invitaciones`.
- [x] Guardar y sincronizar el correo de Auth en `perfiles` para que administración lo vea en la lista del equipo.
- [x] Confirmar que un usuario de Auth nunca obtiene privilegios desde `user_metadata`.
- [x] Crear una Edge Function que valide nombre, correo, contraseña y rol; exija administrador; cree una cuenta confirmada sin enviar correo y asigne el rol en `perfiles`.
- [x] Si falla la asignación del perfil, compensar eliminando la cuenta Auth recién creada y responder sin datos sensibles.
- [x] Incluir la función en los comandos de comprobación.

### Task 2: Administración desde Usuarios

**Files:** `src/funcionalidades/usuarios/pagina-usuarios.tsx`, `src/funcionalidades/usuarios/consultas.ts`, `src/app/panel/usuarios/page.tsx`, `e2e/empresa-usuarios.spec.ts` y documentación de Supabase.

- [x] Sustituir Invitaciones por “Nuevo usuario”, con nombre, correo, contraseña inicial y rol.
- [x] Quitar consultas y presentación de invitaciones; mantener el listado y activar/desactivar Vendedores.
- [x] Probar alta de ambos roles, inicio de sesión y permisos; comprobar que Mailpit no recibió mensajes.
- [x] Ejecutar pruebas E2E, pgTAP, TypeScript, lint, comprobación de Edge Functions y formato.

### Task 3: Demo

- [x] Promover `prueba@test.com` a primer Administrador tras comprobar que no existía otro.
- [x] Publicar la UI y la nueva función en la demo; retirar el endpoint remoto de invitaciones.
- [x] Verificar el acceso de Administración y Productos, sin crear cuentas extra en remoto.
