# Backend del MVP de Empresa Tomhjey — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar implementada y verificable la base de backend del MVP: usuarios y roles, configuración de la empresa, catálogo, inventario, clientes, ventas, facturación NubeFacT y asistencia con IA.

**Architecture:** Supabase Auth y Postgres son la fuente de identidad y datos. RLS y privilegios limitan lecturas/escrituras; RPC transaccionales implementan operaciones críticas de inventario y ventas. Edge Functions privadas verifican la sesión y llaman a NubeFacT u OpenAI; la IA consulta mediante herramientas explícitas y nunca confirma operaciones.

**Tech Stack:** Supabase CLI 2.120.0, PostgreSQL 17 local, pgTAP, Supabase Edge Functions con Deno 2, Next.js 16/TypeScript 5. El frontend no forma parte de este plan.

**Spec:** `docs/superpowers/specs/2026-10-06-empresa-tomhjey-design.md`; alcance: `docs/alcance-mvp.md`.

## Global Constraints

- Una sola empresa operativa; no agregar `tenant_id`, planes, suscripciones ni sucursales.
- Roles: `administrador` y `vendedor`; el rol no se obtiene de `user_metadata` ni de argumentos del cliente.
- RLS se activa en toda tabla en `public`; los permisos de tabla y las políticas se conceden en la misma migración.
- El vendedor consulta sus ventas; el administrador consulta todas.
- El navegador no es autoridad para precios, impuestos, stock ni totales.
- Confirmar una venta actualiza encabezado, stock y movimientos en una transacción; una venta confirmada no se edita ni anula en este MVP.
- El ajuste de inventario exige administrador, motivo y movimiento asociado.
- La IA propone y consulta; no confirma ventas, emite comprobantes ni ajusta existencias.
- NubeFacT es el único proveedor fiscal inicial; no implementar selector de proveedor, modo manual, notas de crédito ni anulaciones fiscales.
- Secretos de NubeFacT y OpenAI solo existen en Edge Functions; no se versionan ni se exponen al navegador.
- Fechas `timestamptz`, importes `numeric`, identificadores UUID; nombres del dominio en español.
- Conservar el sistema visual de Trayecto queda fuera del alcance del backend.

---

## Mapa de archivos

- `supabase/migrations/20261007000100_esquema_mvp.sql`: perfiles, configuración única de empresa, categorías, productos, opciones, existencias, clientes, ventas, comprobantes y auditoría.
- `supabase/migrations/20261007000200_operaciones_mvp.sql`: helpers privados, RLS/grants por rol y RPC de usuarios, inventario y ventas transaccionales.
- `supabase/migrations/20261007000300_facturacion_asistente.sql`: configuración de empresa, emisión segura de comprobantes, conversaciones, herramientas SQL y reportes.
- `supabase/tests/`: pruebas pgTAP de esquema, aislamiento por rol, operaciones, integración fiscal y autorización de facturación.
- `supabase/functions/_shared/http.ts`: respuestas JSON, CORS y lectura autenticada de la sesión.
- `supabase/functions/facturacion/index.ts`: autorización, reserva/reintento de comprobante, llamada HTTP a NubeFacT y registro del resultado.
- `supabase/functions/facturacion/nubefact.ts`: serialización y cliente HTTP tipado de NubeFacT, sin persistencia ni secretos.
- `supabase/functions/facturacion/nubefact_test.ts`: pruebas Deno del contrato, códigos de error, importes y reconciliación.
- `supabase/functions/asistente/index.ts`: autenticación, control de vueltas, persistencia del chat y coordinación de herramientas.
- `supabase/functions/asistente/proveedor.ts`: contrato de proveedor y adaptador OpenAI Responses API.
- `supabase/functions/asistente/herramientas.ts`: allowlist de herramientas, esquemas estrictos y despacho con sesión autenticada.
- `supabase/functions/asistente/asistente_test.ts`: pruebas Deno de herramientas, validación estricta de argumentos y ausencia de herramientas confirmatorias.
- `supabase/config.toml`: configuración por función con verificación JWT habilitada.
- `supabase/README.md`, `supabase/migrations/README.md`, `supabase/functions/README.md`: instrucciones de desarrollo local y secretos requeridos.
- `AGENTS.md`: corregir fuente de verdad/estado solo si los cambios de arquitectura requieren actualizar las instrucciones.

## Plan de ejecución

### Task 1: Modelo de datos y restricciones

**Files:**

- Create: `supabase/migrations/20261007000100_esquema_mvp.sql`
- Test: `supabase/tests/esquema_mvp.test.sql`

**Interfaces:**

- Tablas expuestas: `perfiles`, `empresa`, `categorias`, `productos`, `opciones_producto`, `valores_opcion`, `combinaciones`, `clientes`, `ventas`, `lineas_venta`, `movimientos_inventario`, `comprobantes`, `auditoria`.
- `perfiles.id` referencia `auth.users.id`; `perfiles.rol` solo admite `administrador|vendedor`; `perfiles.activo` controla acceso.
- `empresa` admite exactamente una fila y almacena datos fiscales/comerciales y parámetros de IGV.
- `productos` puede venderse sin combinaciones; con combinaciones, precio y stock viven en combinación.
- `ventas.estado` admite `borrador|confirmada|descartada`; las líneas guardan descripción y precio congelados.
- Existencias se guardan como saldo en combinación/producto vendible y se reflejan en `movimientos_inventario`.

- [x] **Step 1: Escribir pruebas pgTAP del contrato del esquema**: existencia de tablas/columnas, constraints de rol/estado, empresa singleton, claves foráneas e índices usados por FK.
- [x] **Step 2: Ejecutar la prueba contra el esquema vacío** con `npx supabase test db --local`; comprobar que falla por las tablas/constraints ausentes.
- [x] **Step 3: Crear la migración con tablas, constraints e índices**, sin políticas todavía y sin tablas de SaaS.
- [x] **Step 4: Ejecutar `npx supabase test db --local`** y corregir hasta pasar.
- [x] **Step 5: Revisar la migración con `npx supabase db lint --local`** y comprobar que ninguna FK quede sin índice.

### Task 2: RLS, privilegios y usuarios

**Files:**

- Create: `supabase/migrations/20261007000200_operaciones_mvp.sql`
- Test: `supabase/tests/rls_mvp.test.sql`
- Test: `supabase/tests/rls_mvp.test.sql`

**Interfaces:**

- `private.usuario_activo()` devuelve boolean para `auth.uid()` activo.
- `private.tiene_rol(text[])` comprueba el rol persistido en `perfiles` y estado activo.
- `public.inicializar_administrador(uuid)` solo se ejecuta en aprovisionamiento con service role y falla si ya hay administrador.
- La Edge Function `crear-usuario` permite al administrador crear cuentas con rol controlado en `perfiles`; Auth nunca toma el rol de `user_metadata`.
- RLS concede al vendedor catálogo/clientes que usa y sus ventas; el administrador puede gestionar empresa, catálogo, clientes, equipo e inventario.

- [x] **Step 1: Escribir pruebas pgTAP** para usuario sin perfil, inactivo, vendedor y administrador en cada tabla expuesta; probar denegación a `anon`.
- [x] **Step 2: Ejecutar `npx supabase test db --local`** y confirmar fallos por falta de políticas.
- [x] **Step 3: Implementar esquema `private`, helpers con `search_path` fijo, policies por operación y grants mínimos**; no usar `SECURITY DEFINER` salvo helpers internos imprescindibles.
- [x] **Step 4: Escribir y probar provisión de primer administrador y desactivación de vendedor**, asegurando que una persona no pueda elevar su propio rol.
- [x] **Step 5: Ejecutar `npx supabase test db --local` y `npx supabase db lint --local`**; revisar que las tablas expuestas tengan RLS habilitado y ningún `anon` write grant.

### Task 3: Inventario y ventas transaccionales

**Files:**

- Modify: `supabase/migrations/20261007000200_operaciones_mvp.sql`
- Test: `supabase/tests/operaciones_mvp.test.sql`

**Interfaces:**

- `public.ajustar_existencias(uuid, numeric, text) returns uuid`: administrador; cantidad distinta de cero; requiere motivo; actualiza saldo y agrega movimiento en una transacción.
- `public.crear_borrador_venta(uuid, jsonb, uuid default null) returns uuid`: administrador/vendedor; solo crea o edita borrador propio (admin puede gestionar cualquiera); calcula precio e impuestos con datos del servidor.
- `public.confirmar_venta(uuid) returns jsonb`: administrador/vendedor autorizado; bloquea venta y combinaciones en orden determinista, revalida estado/cantidades/precios, calcula totales, descuenta stock, registra movimientos y confirma atómicamente.
- `public.descartar_borrador_venta(uuid) returns void`: solo borrador visible; una venta confirmada no se descarta.

- [x] **Step 1: Escribir tests** para flujo feliz, falta de stock, precio alterado desde cliente, cambio de precio del catálogo, permisos, e idempotencia.
- [x] **Step 2: Ejecutar tests** y verificar que fallen antes de implementar RPC.
- [x] **Step 3: Implementar las RPC con validaciones server-side**, `FOR UPDATE`, orden de lock estable y movimientos vinculados a cada mutación de saldo.
- [x] **Step 4: Ejecutar tests y añadir caso de repetición** para comprobar que la confirmación segunda no descuente stock ni genere movimientos duplicados.
- [x] **Step 5: Ejecutar `npx supabase db lint --local`** y revisar por SQL que no haya camino para escribir el saldo directo desde `authenticated`.

### Task 4: NubeFacT y comprobantes

**Files:**

- Modify: `supabase/migrations/20261007000100_esquema_mvp.sql`
- Modify: `supabase/migrations/20261007000200_operaciones_mvp.sql`
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/facturacion/index.ts`
- Create: `supabase/functions/facturacion/nubefact.ts`
- Test: `supabase/functions/facturacion/nubefact_test.ts`
- Modify: `supabase/config.toml`, `supabase/functions/README.md`

**Interfaces:**

- `POST /functions/v1/facturacion` recibe `{ ventaId, tipo: "boleta" | "factura" }`, exige JWT y administrador; crea o recupera el mismo comprobante idempotente.
- `reservar_comprobante(uuid, uuid, text)` es solo para `service_role`, valida que el administrador esté activo, y persiste serie, correlativo, payload fiscal e intento antes del HTTP; reintentos usan el mismo par serie/número.
- `clienteNubefact.emitir(payload, { ruta, token })` y `clienteNubefact.consultar(serie, numero, { ruta, token })` encapsulan HTTP y devuelven resultado normalizado sin secretos.
- Los secretos se llaman `NUBEFACT_RUTA` y `NUBEFACT_TOKEN` y se cargan desde secretos Edge Function; no agregar valores reales a `.env.example`.

- [x] **Step 1: Escribir pruebas Deno** para serialización fiscal, campos requeridos, respuesta 200, error de negocio y timeout que exige reconciliación antes de reemitir.
- [x] **Step 2: Ejecutar pruebas Deno** y verificar errores antes de implementar el adaptador.
- [x] **Step 3: Implementar el adaptador HTTP** con timeout, parseo estricto, no-log de credenciales y normalización de errores.
- [x] **Step 4: Implementar reserva/idempotencia SQL y Edge Function**, comprobar sesión, rol y propiedad de la venta antes de emitir.
- [x] **Step 5: Probar Deno, pgTAP y lint local**; documentar comandos de secretos sin valores. La llamada real a NubeFacT queda pendiente de credenciales.

### Task 5: Asistente con IA y herramientas limitadas

**Files:**

- Modify: `supabase/migrations/20261007000300_facturacion_asistente.sql`
- Create: `supabase/functions/asistente/index.ts`
- Create: `supabase/functions/asistente/proveedor.ts`
- Create: `supabase/functions/asistente/herramientas.ts`
- Test: `supabase/tests/rls_mvp.test.sql`
- Test: `supabase/functions/asistente/asistente_test.ts`
- Modify: `supabase/config.toml`, `supabase/functions/README.md`

**Interfaces:**

- `conversaciones` y `mensajes` son del usuario; RLS permite al admin soporte de lectura solo si se decide, inicialmente solo su propietario.
- `POST /functions/v1/asistente` recibe `{ conversacionId?, mensaje }`, exige JWT y perfil activo, devuelve respuesta y llamadas de propuesta tipadas.
- El adaptador inicial implementa OpenAI Responses API; `OPENAI_API_KEY` y `OPENAI_MODEL` son secretos/configuración del servidor, proveedor con contrato reemplazable.
- Lista allowlist: `buscar_producto`, `consultar_stock`, `resumen_ventas`, `explicar_pantalla`, `armar_borrador_venta`; ninguna operación de confirmar, facturar, anular o ajustar inventario.
- Máximo tres vueltas de herramientas por interacción; empresa no aparece como argumento de herramientas; datos personales se minimizan.

- [x] **Step 1: Escribir pruebas Deno** para permitir las herramientas autorizadas y rechazar nombres/parámetros extra; los permisos de las RPC se verifican con pgTAP.
- [x] **Step 2: Ejecutar las pruebas** y corregir hasta que pasen.
- [x] **Step 3: Crear tablas de conversación/mensajes con RLS y probar aislamiento por usuario.**
- [x] **Step 4: Implementar herramientas con consultas/RPC existentes** y adaptador Responses API reemplazable; nunca pasar service role al código del modelo.
- [x] **Step 5: Ejecutar tests locales con respuestas del proveedor simuladas**; documentar el test real con API key como opcional y con consumo de tokens explícito.

### Task 6: Consistencia documental y verificación final

**Files:**

- Modify: `supabase/README.md`, `supabase/migrations/README.md`, `supabase/functions/README.md`, `AGENTS.md` solo si la evidencia lo exige.

- [x] **Step 1: Actualizar instrucciones de migraciones** con nombres, generación vía CLI, tests pgTAP y prohibición de SQL sin cobertura RLS.
- [x] **Step 2: Documentar setup local, variables placeholder y comandos de Edge Functions** sin secretos.
- [x] **Step 3: Ejecutar lint, typecheck, formato, build, pgTAP, Supabase DB lint y pruebas Deno.**
- [x] **Step 4: Ejecutar `git diff --check`, revisar los archivos cambiados y documentar límites de entorno o credenciales.**

## Autorrevisión contra el spec

- Auth/perfiles/roles: Tasks 2 y 5.
- Configuración de empresa, catálogo y clientes: Task 1 y RLS en Task 2.
- Inventario, ventas, snapshots, transacción y visibilidad por autor: Task 3.
- NubeFacT, idempotencia, reconciliación y secretos: Task 4.
- Asistente reemplazable, tools allowlisted, permisos y no-confirmación: Task 5.
- RLS y permisos mínimos: Tasks 1–5.
- Documentación y verificación: Task 6.
- Frontend, estilos, reportes completos y flujos fiscales fuera del MVP: fuera del alcance.

---

**Plan completo y guardado en `docs/superpowers/plans/2026-10-07-backend-mvp.md`. El usuario ya eligió ejecución inline al pedir que se construya el backend; continuar con `superpowers:executing-plans` sin solicitar una segunda confirmación.**
