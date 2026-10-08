# Emisión de facturas y boletas — Plan de implementación

> **Para agentes:** implementar tarea por tarea en esta sesión con `superpowers:executing-plans`. Cada tarea termina con revisión independiente del diff antes de pasar a la siguiente.

**Objetivo:** Permitir que administración configure series B y F, emita boletas y facturas de ventas confirmadas, y consulte la aceptación diferida de las boletas desde el panel.

**Arquitectura:** Postgres mantiene las series, reserva correlativos de manera transaccional y limita la consulta de boletas a siete días después del envío y una vez por día. La Edge Function valida la sesión y el rol, envía el comprobante reservado a NubeFacT y guarda emisión/consultas; Next.js ofrece configuración B/F, ventas elegibles e historial.

**Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres/Auth/Edge Functions, NubeFacT HTTP, Prettier 3.

**Especificación:** [docs/superpowers/specs/2026-10-06-empresa-tomhjey-design.md](../specs/2026-10-06-empresa-tomhjey-design.md)

## Restricciones globales

- El proyecto opera como instancia única; no se agregan empresas SaaS, planes ni locales.
- Las tablas expuestas usan RLS; las funciones SQL validan rol y autorización dentro de Postgres.
- NubeFacT, tokens y claves privadas se usan exclusivamente del lado servidor; nunca en `NEXT_PUBLIC_*`.
- Los importes, el RUC y el correlativo se validan en servidor antes de emitir.
- Un reintento conserva el correlativo y consulta NubeFacT antes de volver a enviar si el resultado es incierto.
- La pantalla emite facturas y boletas. Las boletas se consultan manualmente tras siete días y, mientras no se acepten, como máximo una vez al día. No hay cron.
- No se realizan solicitudes reales a NubeFacT durante implementación o verificación local.
- No se aplican migraciones a un proyecto remoto ni se despliega.

---

## Mapa de archivos

- `supabase/migrations/20261008044658_facturacion_facturas.sql`: permite configurar de forma autorizada una serie F activa, sin retroceder el correlativo; audita el cambio.
- `supabase/migrations/<nueva>_facturacion_boletas.sql`: permite configurar series B/F y registrar consultas de aceptación de boletas con la espera y frecuencia definidas.
- `supabase/functions/facturacion/index.ts`: permite `factura` y `boleta`, y agrega la operación segura de consulta de aceptación de boletas.
- `supabase/functions/facturacion/nubefact.ts`: conserva el cliente HTTP y la reconciliación por serie, correlativo, total y fecha.
- `src/app/panel/facturacion/page.tsx`: protege la vista para administración y carga datos con sesión/RLS.
- `src/funcionalidades/facturacion/consultas.ts`: obtiene series, ventas confirmadas sin comprobante e historial visible.
- `src/funcionalidades/facturacion/pagina-facturacion.tsx`: muestra configuración B/F, emisión de ambos tipos y consulta de aceptación de boletas.
- `src/funcionalidades/facturacion/estilos.css`: estilos locales coherentes con el sistema visual existente.
- `src/app/globals.css`: importa los estilos del módulo si la convención actual lo requiere.
- `src/app/panel/[modulo]/page.tsx`: permanece como fallback de los módulos todavía no implementados; la ruta estática `/panel/facturacion` tiene precedencia.
- `src/funcionalidades/facturacion/README.md`: documenta el flujo, el rol y la configuración requerida para emitir.

## Interfaces entre tareas

- La configuración B/F conserva la RPC restringida para factura y agrega una RPC general que valida rol, prefijo, correlativo monotónico y activa solo una serie por tipo.
- La Edge Function recibe `{ operacion: "configurar_serie", tipo, serie, siguienteNumero }`, `{ ventaId, tipo }` para emitir, o `{ operacion: "consultar_boleta", comprobanteId }` para consultar SUNAT.
- `cargarPaginaFacturacion()` devuelve empresa, series, ventas elegibles e historial con fechas de consulta disponibles, sin claves privadas.
- La pantalla consulta boletas con una operación separada; la emisión no se confunde con aceptación y la respuesta queda persistida antes de refrescar.

## Tarea 1: Configurar serie F activa de forma segura

**Archivos:**

- Modificar: `supabase/migrations/20261008044658_facturacion_facturas.sql`
- Revisar: `supabase/migrations/20261007000300_facturacion_asistente.sql`
- Revisar: `supabase/tests/integraciones_mvp.test.sql` para conservar los contratos existentes; no añadir ni ejecutar pruebas en esta solicitud.

**Pasos:**

- [x] Añadir `public.configurar_serie_factura(administrador_objetivo uuid, serie_solicitada text, siguiente_solicitado bigint)` como `SECURITY DEFINER` con `set search_path = ''`, usando nombres de esquema completos.
- [x] Validar que `administrador_objetivo` sea un perfil administrador activo, la forma `^F[A-Z0-9]{3}$` y `siguiente_solicitado > 0`; rechazar cualquier intento de bajar el correlativo almacenado.
- [x] Serializar cambios de serie y reservas con un bloqueo de tabla; si se selecciona otra serie válida, desactivar la anterior y conservarla como historial antes de activar o crear la solicitada.
- [x] Insertar auditoría con serie y próximo correlativo; nunca registrar tokens ni datos de proveedor.
- [x] Revocar ejecución de `public`, `anon` y `authenticated`, conceder solo a `service_role`, y revisar sintaxis y diff sin aplicar la migración. La Edge Function autentica JWT y rol antes de usar la clave privilegiada.

**Entrega comprobable:** la función SQL permite preparar la serie real de NubeFacT y evita reusar números anteriores.

## Tarea 2: Cerrar el contrato de emisión inmediata de factura

**Archivos:**

- Modificar: `supabase/functions/facturacion/index.ts`
- Revisar: `supabase/functions/facturacion/nubefact.ts`
- Revisar: `supabase/migrations/20261007000300_facturacion_asistente.sql`

**Pasos:**

- [x] Añadir la operación `configurar_serie` al manejador después de `autenticar()` y `exigirAdministrador()`; invocar la RPC con `clientePrivilegiado()` y el id de `sesion.usuarioId`.
- [x] Para emisión, rechazar `tipo !== "factura"`; la RPC existente conserva internamente el tipo genérico para la futura boleta.
- [x] Confirmar que la validación de factura exige RUC de empresa y cliente y ocurre antes de consumir correlativo, como ya define `reservar_comprobante`.
- [x] Normalizar la respuesta para devolver `aceptadaPorSunat: respuesta.aceptada_por_sunat === true`, sin convertir una aceptación pendiente en éxito fiscal.
- [x] Mantener el mecanismo existente que guarda payload antes de llamar al proveedor y, ante código 23 o timeout, consulta el mismo número y compara serie, número, total y fecha QR antes de aceptarlo como propio.
- [x] Verificar el diff y que no se haya introducido acceso al proveedor desde el navegador.

**Entrega comprobable:** una factura queda distinguida como enviada/emitida o aceptada por SUNAT según el campo recibido; un error no genera una segunda numeración.

## Tarea 3: Cargar ventas elegibles e historial con RLS

**Archivos:**

- Crear: `src/app/panel/facturacion/page.tsx`
- Crear: `src/funcionalidades/facturacion/consultas.ts`
- Modificar: `src/funcionalidades/facturacion/README.md`

**Pasos:**

- [x] En la ruta, resolver el perfil con `obtenerPerfilActual()`; redirigir a `/panel` si no es administrador.
- [x] Consultar `empresa`, `series_comprobante` activas para `factura`, ventas confirmadas con documento de cliente `ruc` y comprobantes visibles mediante `crearClienteSupabaseServidor()`; no usar `service_role` para estas lecturas.
- [x] Excluir ventas que ya tengan comprobante para que la venta no aparezca como emitible de nuevo, comprobando solo los ids candidatos para evitar truncamiento por límites de resultados.
- [x] Modelar respuestas de error de Supabase de forma visible y enviar al componente solo campos necesarios para la pantalla.
- [x] Documentar que antes de emitir se configura la serie F y el siguiente número que corresponda en NubeFacT.

**Entrega comprobable:** la página solo carga ventas que el administrador puede facturar y conserva las restricciones RLS.

## Tarea 4: Construir el flujo de facturación en el panel

**Archivos:**

- Crear: `src/funcionalidades/facturacion/pagina-facturacion.tsx`
- Crear: `src/funcionalidades/facturacion/estilos.css`
- Modificar: `src/app/globals.css` solo para importar la hoja local si los módulos existentes lo hacen así.

**Pasos:**

- [x] Presentar formulario de serie F y siguiente correlativo; invocar `facturacion` con `{ operacion: "configurar_serie", serie, siguienteNumero }` y mostrar errores de validación sin ocultarlos.
- [x] Advertir junto al correlativo que debe coincidir con el siguiente número habilitado en NubeFacT; no prellenar `F001` ni un número inventado.
- [x] Listar ventas elegibles con número/fecha, cliente, RUC, moneda y total; ofrecer exclusivamente la acción «Emitir factura».
- [x] Invocar `facturacion` con `{ ventaId, tipo: "factura" }`, impedir doble clic mientras procesa y distinguir `emitiendo`, `emitido`, aceptación SUNAT, rechazo y error.
- [x] Listar comprobantes existentes con serie y correlativo; mostrar enlace PDF solo si la respuesta guardada incluye una URL HTTPS de NubeFacT, en una pestaña nueva con `rel="noopener noreferrer"`.
- [x] Ofrecer «Reintentar» para comprobantes en estado `error` y «Verificar estado» cuando siga `emitiendo`; reutilizar el mismo envío `{ ventaId, tipo: "factura" }`, sin reservar otra venta ni otro correlativo. No mostrar reintento para `rechazado` ni `emitido`.
- [x] Después de una respuesta válida, llamar `router.refresh()`; no anunciar emisión ni aceptación antes de recibir el resultado persistido.
- [x] Mantener el diseño sobrio del sistema existente y estados responsivos para carga, lista vacía, error y pantalla angosta.

**Entrega comprobable:** administración puede configurar la serie, seleccionar una venta elegible, emitir factura y ver el estado actual con acceso al PDF devuelto.

## Tarea 5: Formateo y verificación local

**Archivos:** todos los archivos modificados en las tareas anteriores.

**Pasos:**

- [x] Formatear solo los archivos del cambio con la versión local: `npx prettier --write <archivos-modificados>` (Prettier no tiene parser SQL instalado; el archivo SQL se revisó manualmente).
- [x] Ejecutar `npm run format:check` y `npm run lint`.
- [x] Ejecutar `npm run typecheck`, `npm run build` y `npm run functions:check`.
- [x] Ejecutar `npm run supabase:lint` y revisar `git diff --check`, `git status` y el diff para confirmar que no se incluyó `.env.local` ni credenciales.
- [x] No ejecutar pruebas, NubeFacT, migraciones, Supabase remoto ni despliegues en este alcance.

**Entrega comprobable:** lint, formato, tipos, compilación y tipos Deno pasan; la migración queda versionada para revisión y no aplicada.

## Tarea 6: Habilitar boletas y seguimiento diferido

**Archivos:**

- Crear: `supabase/migrations/20261008050019_habilitar_boletas.sql`
- Modificar: `supabase/functions/facturacion/index.ts`
- Modificar: `src/funcionalidades/facturacion/consultas.ts`
- Modificar: `src/funcionalidades/facturacion/pagina-facturacion.tsx`
- Modificar: `src/funcionalidades/facturacion/README.md`
- Modificar: `docs/alcance-mvp.md`
- Modificar: esta especificación y plan.

**Pasos:**

- [x] Configurar serie B y F con autorización de administrador, prefijo correspondiente, correlativo no decreciente y una serie activa por tipo.
- [x] Permitir en la Edge Function únicamente los tipos factura/boleta y conservar la validación existente: factura con RUC del cliente; boleta con documento cuando supera el límite fiscal.
- [x] Al enviar una boleta, persistir emisión como `emitido` pero no mostrar aceptación inmediata de SUNAT, aunque el proveedor devuelva un booleano true.
- [x] Agregar una consulta manual que solo administre boletas emitidas, compruebe la identidad del número/respuesta y persista la consulta.
- [x] Bloquear consultas hasta siete días después del envío y limitar consultas pendientes a una cada 24 horas; registrar el resultado «no encontrada» como pendiente, no como rechazo.
- [x] Extender las ventas elegibles para boletas con/sin documento; mantener la factura disponible solo para cliente con RUC.
- [x] Mostrar botones de emisión por tipo y seguimiento «Consultar aceptación» con la próxima fecha permitida; conservar PDF y estados sin mezclar rechazo de emisión con falta de aceptación.
- [x] Actualizar la especificación y README; verificar formato, lint, tipos, build, Edge Functions y diff. No ejecutar pruebas, aplicar migraciones ni llamar al proveedor.

**Entrega comprobable:** administración emite facturas y boletas; factura muestra aceptación inmediata si NubeFacT la confirma, y boleta solo cambia su aceptación tras consulta manual disponible desde el séptimo día.
