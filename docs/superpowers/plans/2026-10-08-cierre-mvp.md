# Cierre del MVP de Empresa Tomhjey — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Completar las pantallas y conexiones locales de Empresa, Productos, Inventario, Clientes, Ventas, Facturación, Asistente IA, Usuarios, Inicio y reportes conforme al spec aprobado, y verificar los flujos completos sin enviar comprobantes a un entorno fiscal no confirmado.

**Architecture:** Next.js 16 App Router usa Server Components para cargar datos con la sesión SSR y Client Components para formularios e interacciones. Supabase Auth, RLS y RPC mantienen la autorización y las operaciones transaccionales; Edge Functions conservan las claves de NubeFacT y OpenAI.

**Tech Stack:** Next.js 16.4.0, React 19.3.0, TypeScript, Supabase JS 2.117.2, Supabase CLI 2.120.0, Deno, Playwright 1.63.0 y Prettier 3.9.9.

**Spec:** `docs/superpowers/specs/2026-10-06-empresa-tomhjey-design.md`; alcance funcional en `docs/alcance-mvp.md`.

## Global Constraints

- Mantener la arquitectura de una sola empresa, sin `tenant_id`, planes, suscripciones ni locales.
- Los roles son únicamente `administrador` y `vendedor`; `perfiles` es la fuente de verdad y nunca se autoriza con `user_metadata`.
- La autorización real vive en RLS, RPC o Edge Function; ocultar controles en la interfaz no cuenta como autorización.
- Precios, impuestos, totales, saldos de inventario y correlativos se calculan o reservan en Postgres.
- El asistente no confirma ventas, emite comprobantes ni ajusta stock; la persona confirma cada propuesta desde el flujo ordinario.
- Las credenciales privadas nunca llegan al navegador ni se escriben en archivos versionados.
- La implementación visual reutiliza los tokens, fuentes, componentes y estilos portados del sistema Trayecto existente; no crea un tema paralelo.
- No ejecutar `supabase:reset`; conservar la cuenta local existente y limpiar únicamente los datos temporales creados por las pruebas.
- No llamar a NubeFacT hasta comprobar que las credenciales apuntan explícitamente al sandbox. La función exige `NUBEFACT_AMBIENTE`, `NUBEFACT_RUC_EMISOR` coincidente con Empresa y un permiso adicional para producción; usar contratos simulados mientras falte cualquiera de esos datos.

---

### Task 1: Preparar y verificar el esquema local sin borrar datos

**Files:**

- Review: `supabase/migrations/20261008044658_facturacion_facturas.sql`
- Review: `supabase/migrations/20261008050019_habilitar_boletas.sql`
- Test: `supabase/tests/integraciones_mvp.test.sql`

**Interfaces:**

- Consume: las tres migraciones iniciales ya aplicadas y el Supabase local no vinculado a proyecto remoto.
- Produces: las dos migraciones fiscales pendientes aplicadas en la base local, sin reset ni modificación de datos existentes.

- [x] **Step 1: Revisar el carácter aditivo de las migraciones**

Confirmar que la migración de facturas solo declara la función de serie y que la migración de boletas agrega columnas y reemplaza funciones; no ejecutar comandos que borren o reinicialicen tablas.

- [x] **Step 2: Aplicar solo migraciones pendientes al Supabase local**

Run: `npx supabase migration up --local`

Expected: se aplican `20261008044658` y `20261008050019`; no cambia el perfil local existente.

- [x] **Step 3: Confirmar estado y probar políticas/contratos**

Run: `npm run supabase:test`

Expected: las pruebas pgTAP terminan correctamente y `npx supabase migration list --local` muestra las cinco migraciones locales aplicadas.

---

### Task 2: Completar catálogo de productos y combinaciones

**Files:**

- Create: `src/funcionalidades/productos/consultas.ts`
- Create: `src/funcionalidades/productos/pagina-productos.tsx`
- Modify: `src/compartido/estilos/modulos.css`
- Create: `src/app/panel/productos/page.tsx`
- Remove: `src/app/panel/[modulo]/page.tsx`
- Test: `e2e/productos.spec.ts`

**Interfaces:**

- Consumes: sesión SSR, tablas `categorias`, `productos`, `opciones_producto`, `valores_opcion`, `combinaciones` y políticas existentes.
- Produces: `/panel/productos` con listado, búsqueda, alta/edición, categorías y combinaciones; el vendedor solo consulta.

- [x] **Step 1: Añadir pruebas E2E de consulta, campos vacíos, creación y edición**

El escenario crea un producto simple con SKU único y categoría, rechaza nombre/SKU vacíos, edita nombre y precio, y verifica que un vendedor no vea controles de escritura.

- [x] **Step 2: Ejecutar las pruebas nuevas y confirmar el fallo esperado**

Run: `npx playwright test e2e/productos.spec.ts`

Expected: FAIL porque `/panel/productos` sigue mostrando la vista «preparando».

- [x] **Step 3: Implementar lectura y formulario de catálogo**

Leer categorías y productos en el Server Component con el cliente SSR; en cliente validar campos requeridos, guardar mediante operaciones permitidas por RLS y refrescar el router. No incluir campos de existencias en las escrituras de producto.

- [x] **Step 4: Añadir creación de combinaciones si el producto las usa**

Mantener como máximo dos ejes, generar SKU único por combinación e iniciar cada una con el precio base y stock cero; mostrar errores SQL traducidos en el formulario.

- [x] **Step 5: Verificar pruebas E2E y tipos**

Run: `npx playwright test e2e/productos.spec.ts && npm run typecheck`

Expected: PASS; administración crea/edita, vendedor consulta sin modificar y campos vacíos quedan bloqueados por el formulario.

---

### Task 3: Conectar inventario y movimientos

**Files:**

- Create: `src/funcionalidades/inventario/consultas.ts`
- Create: `src/funcionalidades/inventario/pagina-inventario.tsx`
- Reuse: `src/compartido/estilos/modulos.css`
- Create: `src/app/panel/inventario/page.tsx`
- Remove: `src/app/panel/[modulo]/page.tsx`
- Test: `e2e/inventario.spec.ts`

**Interfaces:**

- Consumes: RPC `ajustar_existencias(producto_objetivo, combinacion_objetivo, cambio, razon)` y tablas de movimientos/productos/combinaciones.
- Produces: existencias visibles y movimientos recientes; ajuste disponible únicamente para administración con motivo requerido.

- [x] **Step 1: Escribir prueba E2E de saldo, ajuste válido y motivo vacío**

Crear producto temporal, comprobar saldo inicial, intentar un ajuste sin motivo y verificar que no cambia el saldo; ajustar con motivo y verificar saldo y movimiento.

- [x] **Step 2: Ejecutar la prueba y verificar el fallo antes de implementar**

Run: `npx playwright test e2e/inventario.spec.ts`

Expected: FAIL porque la ruta aún es un marcador.

- [x] **Step 3: Implementar listado y RPC de ajuste**

La interfaz no actualiza existencias directamente; cada cambio llama a `ajustar_existencias` y muestra error de stock insuficiente sin mutar el saldo.

- [x] **Step 4: Verificar permisos y E2E**

Run: `npx playwright test e2e/inventario.spec.ts && npm run supabase:test`

Expected: PASS; vendedor ve existencias pero no puede ajustar, administrador registra movimiento auditable.

---

### Task 4: Conectar clientes y su historial

**Files:**

- Create: `src/funcionalidades/clientes/consultas.ts`
- Create: `src/funcionalidades/clientes/pagina-clientes.tsx`
- Reuse: `src/compartido/estilos/modulos.css`
- Create: `src/app/panel/clientes/page.tsx`
- Remove: `src/app/panel/[modulo]/page.tsx`
- Test: `e2e/clientes.spec.ts`

**Interfaces:**

- Consumes: tabla `clientes`, RLS de equipo y `ventas` para historial.
- Produces: búsqueda, creación/edición, estado activo y consulta de ventas relacionadas; datos personales no se exponen a otros roles fuera de sus políticas.

- [x] **Step 1: Añadir prueba E2E para campos vacíos, alta, edición e historial sin ventas**
- [x] **Step 2: Ejecutar `npx playwright test e2e/clientes.spec.ts` y verificar que falla en la ruta temporal**
- [x] **Step 3: Implementar consultas SSR y formulario con el esquema existente de `clientes`**
- [x] **Step 4: Comprobar que las ventas guardan snapshots fiscales y que editar el cliente no altera ventas previas**
- [x] **Step 5: Verificar con `npx playwright test e2e/clientes.spec.ts && npm run typecheck`**

Expected: PASS con cliente creado, editado y accesible por búsqueda; la lista valida nombre requerido y documento según las restricciones existentes.

---

### Task 5: Completar ventas de borrador a confirmación

**Files:**

- Create: `src/funcionalidades/ventas/consultas.ts`
- Create: `src/funcionalidades/ventas/pagina-ventas.tsx`
- Reuse: `src/compartido/estilos/modulos.css`
- Create: `src/app/panel/ventas/page.tsx`
- Remove: `src/app/panel/[modulo]/page.tsx`
- Test: `e2e/ventas.spec.ts`

**Interfaces:**

- Consumes: `crear_borrador_venta(cliente_objetivo, lineas, venta_objetivo)`, `confirmar_venta(venta_objetivo)` y `descartar_borrador_venta(venta_objetivo)`.
- Produces: listado por rol, formulario de borrador con productos y cliente opcional, total provisto por servidor y confirmación transaccional que descuenta existencias una sola vez.

- [x] **Step 1: Escribir recorrido E2E de borrador, edición, campos vacíos, confirmación y stock**
- [x] **Step 2: Ejecutar `npx playwright test e2e/ventas.spec.ts` y verificar fallo por sección no implementada**
- [x] **Step 3: Implementar listado SSR respetando vendedor/administrador y estados de venta**
- [x] **Step 4: Guardar borrador y edición llamando RPC, mostrar desglose del servidor y descartar con confirmación**
- [x] **Step 5: Confirmar mediante RPC y comprobar en E2E que saldo baja una vez incluso al repetir confirmación**
- [x] **Step 6: Verificar con `npx playwright test e2e/ventas.spec.ts && npm run supabase:test`**

Expected: PASS; no existe escritura de total o stock desde la interfaz y el vendedor solo lista ventas propias.

---

### Task 6: Implementar Empresa y Usuarios para administración

**Files:**

- Create: `src/funcionalidades/empresa/consultas.ts`
- Create: `src/funcionalidades/empresa/pagina-empresa.tsx`
- Create: `src/funcionalidades/usuarios/consultas.ts`
- Create: `src/funcionalidades/usuarios/pagina-usuarios.tsx`
- Create: `src/app/panel/empresa/page.tsx`
- Create: `src/app/panel/usuarios/page.tsx`
- Modify: `src/funcionalidades/panel/panel-shell.tsx`
- Remove: `src/app/panel/[modulo]/page.tsx`
- Test: `e2e/empresa-usuarios.spec.ts`

**Interfaces:**

- Consumes: RPC `guardar_empresa`, `invitar_vendedor`, `cambiar_estado_vendedor`; Edge Function `invitar-vendedor`; tablas `empresa`, `perfiles`, `invitaciones`.
- Produces: configuración fiscal/comercial con validación de RUC; lista del equipo, envío de invitación y activación/desactivación de vendedores.

- [x] **Step 1: Añadir E2E de guardado de empresa, RUC inválido, invitación vacía y rol**
- [x] **Step 2: Verificar que las pruebas fallan por ruta ausente o marcador**
- [x] **Step 3: Implementar configuración de empresa por RPC sin cambiar el RUC desde una ruta no autorizada**
- [x] **Step 4: Implementar usuarios con funciones protegidas y mensajes de error; no permitir elevar el rol desde el navegador**
- [x] **Step 5: Verificar que vendedor no accede por URL directa y que administración gestiona el equipo**
- [x] **Step 6: Ejecutar `npx playwright test e2e/empresa-usuarios.spec.ts && npm run typecheck`**

Expected: PASS; los controles de configuración y usuarios solo son visibles y ejecutables por administración.

---

### Task 7: Conectar Inicio y reportes básicos

**Files:**

- Modify: `src/app/panel/page.tsx`
- Create: `src/funcionalidades/inicio/consultas.ts`
- Create: `src/funcionalidades/reportes/consultas.ts`
- Create: `src/funcionalidades/reportes/pagina-reportes.tsx`
- Create: `src/app/panel/reportes/page.tsx`
- Modify: `src/funcionalidades/panel/panel-shell.tsx`
- Test: `e2e/ventas.spec.ts`, `e2e/acceso.spec.ts`

**Interfaces:**

- Consumes: RPC `resumen_inicio(desde, hasta)` y `reporte_ventas(desde, hasta)`; políticas de ventas por rol.
- Produces: indicadores reales, actividad reciente, alertas de stock y reporte por periodo con productos vendidos.

- [x] **Step 1: Escribir E2E de datos vacíos, rango válido y aislamiento de vendedor**
- [x] **Step 2: Verificar Inicio con sesión y datos locales**
- [x] **Step 3: Leer resumen y actividad desde las RPC existentes, sin duplicar cálculos en frontend**
- [x] **Step 4: Implementar reporte básico de ventas por fecha y mostrar vacíos/error de consulta**
- [x] **Step 5: Verificar reportes por periodo, estado vacío y aislamiento del vendedor en los recorridos Playwright**

Expected: PASS; los importes del vendedor coinciden con sus ventas visibles y no exponen ventas ajenas.

---

### Task 8: Conectar el Asistente IA a su Edge Function

**Files:**

- Create: `src/funcionalidades/asistente/consultas.ts`
- Create: `src/funcionalidades/asistente/pagina-asistente.tsx`
- Reuse: `src/compartido/estilos/modulos.css`
- Create: `src/app/panel/asistente/page.tsx`
- Remove: `src/app/panel/[modulo]/page.tsx`
- Test: `e2e/asistente.spec.ts`

**Interfaces:**

- Consumes: Edge Function `asistente`, tablas de conversación/mensajes y borrador de venta devuelto por las herramientas del servidor.
- Produces: conversación persistida, preguntas guiadas, estados de carga/error y propuesta explícita que enlaza al borrador ordinario sin confirmar.

- [x] **Step 1: Añadir prueba E2E para mensaje vacío, envío y respuesta**
- [x] **Step 2: Ejecutar la prueba con respuesta de función controlada y verificar el fallo por página no implementada**
- [x] **Step 3: Implementar carga SSR del historial y envío autenticado mediante `functions.invoke("asistente", …)`**
- [x] **Step 4: Mostrar errores recuperables sin borrar conversación y mantener los datos sensibles fuera del prompt**
- [x] **Step 5: Probar el proveedor real una vez con texto sintético y límite de una interacción; nunca ejecutar una herramienta de confirmación**
- [x] **Step 6: Ejecutar `npx playwright test e2e/asistente.spec.ts && npm run functions:test && npm run functions:check`**

Expected: PASS; la respuesta real se obtiene con la clave local, el historial persiste y las propuestas quedan sin confirmar.

---

### Task 9: Integrar navegación, estados y recorrido E2E integral

**Files:**

- Remove: `src/app/panel/[modulo]/page.tsx`
- Modify: `src/funcionalidades/panel/panel-shell.tsx`
- Modify: `e2e/acceso.spec.ts`
- Test: `e2e/productos.spec.ts`, `e2e/ventas.spec.ts`, `e2e/facturacion.spec.ts`
- Modify: `playwright.config.ts` only if the existing local server setup cannot support the added scenarios.

**Interfaces:**

- Consumes: páginas completas de tareas 2–8 y página de facturación existente.
- Produces: navegación a módulos implementados, recorrido del MVP desde acceso hasta venta/facturación y validación móvil sin desbordamiento.

- [x] **Step 1: Reemplazar marcadores dinámicos por rutas concretas y agregar navegación de Empresa/Reportes**
- [x] **Step 2: Crear recorrido que prepare producto, cliente, ajuste, venta y borrador fiscal con identidades temporales**
- [x] **Step 3: Ejecutar `npx playwright test e2e/recorrido-mvp.spec.ts` y revisar limpieza aun ante fallo**
- [x] **Step 4: Mantener emisión externa deshabilitada en E2E; probar facturación con sus contratos simulados y la UI de series/estados**
- [x] **Step 5: Ejecutar la suite Playwright completa en escritorio y móvil**

Expected: PASS; los datos temporales se limpian y la suite no emite factura/boleta a NubeFacT.

---

### Task 10: Verificación y revisión final

**Files:**

- Verify: `src/`, `supabase/`, `e2e/`, `.env.example`, `package.json`

**Interfaces:**

- Consumes: todos los módulos del MVP y pruebas agregadas.
- Produces: build, lint, typecheck, Prettier, pgTAP, Edge Function tests/type checks y E2E con resultado registrado.

- [x] **Step 1: Ejecutar comprobaciones sin paralelismo con Playwright**

Run, en orden: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run supabase:test`, `npm run supabase:lint`, `npm run functions:test`, `npm run functions:check`, `npm run test:e2e`, `npm run build`.

- [x] **Step 2: Corregir fallos en ciclos TDD y repetir la comprobación afectada**

Expected: cada fallo queda corregido por una prueba que primero falló por el comportamiento pendiente.

- [x] **Step 3: Revisar el diff y comprobar que no contiene secretos ni datos de prueba**

Run: `git diff --check && git status --short && git diff --stat`

Expected: solo quedan cambios del cierre del MVP; `.env.local`, credenciales, perfiles y registros temporales permanecen fuera del diff.

- [x] **Step 4: Bloquear emisiones si el ambiente o la RUC emisora no están confirmados**

Run: `npm run functions:test`.

Expected: ambiente sin declarar, RUC emisora ausente/distinta y producción sin permiso explícito no llegan a reservar correlativo ni llamar a NubeFacT.
