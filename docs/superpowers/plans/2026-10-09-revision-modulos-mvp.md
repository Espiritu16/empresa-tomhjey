# Revisión y correcciones del MVP — Plan de implementación

> **Para agentes de implementación:** ejecutar tarea por tarea y verificar cada paso antes de continuar. Se ejecutará en línea para proteger los cambios locales existentes.

**Objetivo:** corregir los defectos comprobados en modales y aislamiento de pruebas, y verificar los recorridos de los módulos del MVP sin alterar los datos locales existentes.

**Arquitectura:** mantener Next.js y Supabase como están. Las pruebas SQL seguirán usando transacciones con rollback; E2E usará cuentas temporales, nombres por ejecución y restauración del nombre de empresa que ya existía.

**Stack:** Next.js 16, TypeScript, Playwright, Supabase local, pgTAP y Deno.

**Especificación:** `docs/alcance-mvp.md` y `docs/superpowers/specs/2026-10-06-empresa-tomhjey-design.md`.

## Restricciones

- No reiniciar la base local ni cambiar datos fuera de fixtures E2E identificables.
- No leer ni imprimir `.env.local`; las pruebas usan la configuración existente sin mostrar credenciales.
- No modificar el flujo de negocio si no hay un fallo reproducible.
- Respetar el sistema visual existente y las migraciones ya aplicadas.

---

### Tarea 1: Compatibilizar pruebas SQL con la empresa local única

**Archivos:**

- Modificar: `supabase/tests/integraciones_mvp.test.sql`
- Modificar: `supabase/tests/operaciones_mvp.test.sql`
- Modificar: `supabase/tests/rls_mvp.test.sql`

- [x] **Paso 1: Confirmar regresión**

La suite ya se ejecutó contra la base local. Los tres archivos fallaron al insertar la fila singleton de `public.empresa`; los otros cuatro archivos pasaron. La transacción de pgTAP se revierte al terminar cada archivo.

- [x] **Paso 2: Hacer idempotente el fixture temporal**

Usar `INSERT ... ON CONFLICT (unica) DO UPDATE` en cada fixture, con los valores de empresa que esa prueba espera. Conservar `begin` / `rollback` para no persistir el cambio de la fila local.

- [x] **Paso 3: Ejecutar pgTAP**

Ejecutar `npm run supabase:test`. Los siete archivos deben terminar `ok` y el resultado debe ser `PASS`.

### Tarea 2: Aislar y restaurar los datos de E2E

**Archivos:**

- Modificar: `e2e/configuracion/preparar.ts`
- Modificar: `e2e/configuracion/limpiar.ts`
- Modificar: `e2e/configuracion/limpieza-datos.ts`
- Modificar: `e2e/productos.spec.ts`
- Modificar: `e2e/empresa-usuarios.spec.ts`

- [x] **Paso 1: Crear un prefijo único por ejecución**

Guardar un identificador aleatorio en el estado temporal con permisos `0600`. Usarlo en las categorías y correos invitados creados por E2E, y filtrar la limpieza por ese prefijo exacto, no por `E2E-%` o `e2e-invitado-%` globales.

- [x] **Paso 2: Guardar y restaurar el nombre original**

Si la empresa singleton ya existía, guardar `nombre`, `actualizado_por` y `actualizado_en` en el estado temporal. Tras limpiar las filas de prueba, restaurar esos campos y comprobar que coinciden. Si la empresa la creó el setup, eliminar solo esa fila al finalizar.

- [x] **Paso 3: Ejecutar E2E y comprobar limpieza**

Ejecutar la suite completa solo después de los pasos anteriores. El global teardown debe terminar sin errores y verificar la restauración de la empresa existente.

### Tarea 3: Corregir el checkbox del modal de producto

**Archivos:**

- Modificar: `e2e/productos.spec.ts`
- Modificar: `src/funcionalidades/productos/pagina-productos.tsx`
- Modificar: `src/compartido/estilos/modulos.css`

- [x] **Paso 1: Añadir una comprobación visual que falle**

En el recorrido de alta de producto, comprobar que el checkbox de combinaciones mide como un control compacto y que queda alineado con su etiqueta. Ejecutar ese caso y confirmar el fallo antes de tocar producción.

- [x] **Paso 2: Limitar el estilo de campo a controles de texto**

Excluir `input[type="checkbox"]` de la regla de ancho y alto de campos; aplicar al checkbox la clase de estilo compartida que ya usa la configuración de empresa.

- [x] **Paso 3: Verificar el caso y el módulo**

Ejecutar el caso de productos con Playwright y confirmar que la caja mide `18px` y el texto queda junto al control. El recorrido debe continuar creando combinaciones.

### Tarea 4: Reproducir y clasificar el aviso de Next en desarrollo

**Archivos:**

- Solo modificar el archivo que la reproducción identifique como origen.
- Mantener el build de producción como comprobación independiente.

- [x] **Paso 1: Recargar las rutas afectadas en modo desarrollo**

Observar el overlay y los errores de consola después de una carga nueva con sesión válida. El build ya pasó, pero el navegador mostró una alerta de `Date.now()` durante prerender.

- [x] **Paso 2: Trazar el origen con las guías de Next 16.4 instaladas**

Comprobar si el reloj se evalúa durante render o dentro de una ruta de sesión Supabase. No mover llamadas de handlers ni añadir `io()` sin demostrar que esa llamada origina el error.

- [x] **Paso 3: Corregir únicamente si se reproduce en código de la aplicación**

Agregar una regresión si el origen está en una ruta de render propia. Si procede de instrumentación de desarrollo y no afecta render, tipos ni build, documentar la evidencia sin alterar la arquitectura.

### Tarea 5: Verificar todos los recorridos existentes

**Ámbito:** login y roles, productos, inventario, clientes y consulta documental, ventas y reportes, empresa y usuarios, facturación, asistente.

- [x] **Paso 1: Ejecutar Playwright completo**

Usar `npm run test:e2e` después de aislar los fixtures; revisar fallos por módulo y corregir cada causa comprobada.

- [x] **Paso 2: Evaluar la integración real de IA**

La prueba real está opt-in con `EMPRESA_TOMHJEY_E2E_IA_REAL=1`. Ejecutarla solo en esta prueba solicitada y reportar por separado su resultado. No emitir comprobantes reales durante esta verificación.

- [x] **Paso 3: Ejecutar verificaciones de cierre**

Ejecutar `npm run lint`, `npm run typecheck`, `npm run build`, `npm run functions:test`, `npm run functions:check`, `npm run supabase:lint`, `npm run supabase:test` y `git diff --check`.

- [x] **Paso 4: Revisar el diff**

Confirmar que no se tocaron secretos, que los archivos ajenos permanecen intactos y que todas las pruebas cubren el alcance declarado.

### Tarea 6: Cerrar cobertura de Inicio y Reportes, y separar monedas

**Hallazgo:** `reporte_ventas` agrupa solo por descripción y suma importes de monedas distintas; la interfaz además formatea todo como PEN. Las ventas conservan la moneda de su momento de creación, aunque luego cambie la moneda configurada en Empresa.

**Archivos:**

- Crear: `supabase/migrations/20261009205151_separar_monedas_en_reportes.sql`
- Crear: `supabase/tests/reportes_monedas.test.sql`
- Modificar: `supabase/functions/asistente/herramientas.ts`
- Modificar: `supabase/functions/asistente/asistente_test.ts`
- Modificar: `src/funcionalidades/reportes/consultas.ts`
- Modificar: `src/funcionalidades/reportes/pagina-reportes.tsx`
- Modificar: `src/funcionalidades/inicio/consultas.ts`
- Modificar: `src/app/panel/page.tsx`
- Crear: `src/compartido/formato-moneda.ts`
- Crear: `e2e/inicio-reportes.spec.ts`

- [x] **Paso 1: Regresión SQL**

Preparar dos ventas del mismo producto, una en PEN y otra en USD; comprobar que el reporte mantiene filas e importes separados por moneda.

- [x] **Paso 2: Cubrir recorridos faltantes**

Probar los indicadores y el acceso al asistente desde Inicio; en Reportes, probar rango válido y rechazo de fechas invertidas.

- [x] **Paso 3: Implementar el contrato**

Devolver moneda por fila y totales agrupados por moneda; presentar los mismos importes separados en Inicio y Reportes.

- [x] **Paso 4: Verificar los módulos y el cierre**

Ejecutar la prueba SQL de regresión, E2E de Inicio/Reportes, y todas las comprobaciones de cierre sin reiniciar Supabase.
