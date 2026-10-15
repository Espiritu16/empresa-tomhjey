# Consulta de facturas y boleta simple sin cliente — Plan de implementación

> **Para agentes ejecutores:** se recomienda usar `superpowers:subagent-driven-development` o `superpowers:executing-plans` para ejecutar el plan tarea por tarea. Cada tarea termina con una comprobación independiente.

**Objetivo:** permitir consultar manualmente el estado de facturas ya emitidas y preparar boletas simples sin cliente por menos de S/700, sin romper la emisión automática ni el asistente.

**Arquitectura:** Facturación agrega una operación administrativa de consulta que reserva el comprobante, consulta NubeFacT y persiste el resultado; no reutiliza la emisión. Ventas y la RPC existente permiten `cliente_id = null` solo cuando el comprobante es boleta y el total es menor de S/700. El asistente recibe el mismo contrato nullable, pero conserva las validaciones fiscales del servidor.

**Stack:** Next.js 16, TypeScript, Supabase Postgres/RPC, Supabase Edge Functions con Deno, Playwright y pgTAP existentes.

**Especificación:** `docs/alcance-mvp.md` y `docs/superpowers/specs/2026-10-06-empresa-tomhjey-design.md`.

## Restricciones globales

- La aplicación opera para una sola empresa, con roles `administrador` y `vendedor`.
- La facturación externa y sus secretos viven en Edge Functions; no se exponen al navegador.
- Una consulta fiscal no vuelve a emitir un comprobante ni reserva un correlativo nuevo.
- Confirmar una venta descuenta inventario de forma transaccional; un borrador no lo modifica.
- Las reglas del total y del límite de S/700 se aplican en Postgres, no se confía en el navegador ni en la IA.
- Las boletas simples sin cliente solo son válidas por debajo de S/700; desde S/700 se exige cliente identificado.
- No desplegar ni modificar el proyecto Supabase remoto en este trabajo.

---

## Mapa de archivos

- `src/funcionalidades/facturacion/pagina-facturacion.tsx`: acción administrativa «Consultar estado» para facturas pendientes y mensajes resultantes.
- `supabase/functions/facturacion/index.ts`: operación JWT protegida para consultar facturas ya emitidas.
- Nueva migración Supabase: reserva/persistencia segura de consulta de factura y constraint que permite ventas sin cliente únicamente para boletas simples válidas.
- `src/funcionalidades/ventas/pagina-ventas.tsx`: selector de cliente opcional en boletas; obligatorio para facturas y para boletas que alcancen el límite.
- `supabase/functions/asistente/proveedor.ts` y `herramientas.ts`: instrucciones y argumentos para preparar una boleta simple sin cliente y pedir identificación si Postgres rechaza el umbral.
- `supabase/tests/boleta_simple_sin_cliente.test.sql`: contrato transaccional para los casos con y sin cliente.
- `e2e/facturacion.spec.ts`: recorrido del formulario de venta sin cliente y acción de consulta de factura sin reemisión.
- `supabase/functions/asistente/asistente_test.ts`: contrato de la herramienta nullable y guía de boleta simple.
- `docs/alcance-mvp.md` y `docs/superpowers/specs/2026-10-06-empresa-tomhjey-design.md`: reglas y comportamiento aceptados.

## Tarea 1 — Proteger el flujo fiscal de consulta de factura

1. [x] Agregar prueba pgTAP que demuestre que solo administración reserva consultas de facturas emitidas, que una reserva simultánea se bloquea y que guardar la respuesta no cambia emisión, serie ni correlativo.
2. [x] Ejecutar esa prueba antes de la implementación y comprobar que falla por las funciones faltantes.
3. [x] Crear la migración con `npx supabase migration new consulta_facturas_y_boleta_simple`.
4. [x] Implementar `reservar_consulta_factura` y `registrar_consulta_factura` como funciones `SECURITY DEFINER` con búsqueda segura, verificación explícita del perfil administrador activo, permisos `service_role` solamente y auditoría.
5. [x] En la Edge Function, aceptar `operacion: "consultar_factura"`, verificar el ID, consultar `tipo_de_comprobante`, serie y número guardados y persistir la respuesta sin invocar emisión.
6. [x] Correr pgTAP y `npm run functions:test`.

## Tarea 2 — Boleta simple sin cliente en Postgres y Ventas

1. [x] Agregar pruebas pgTAP para: boleta simple bajo S/700 sin cliente permitida; factura sin cliente rechazada; boleta sin cliente desde S/700 rechazada; confirmación simple descuenta stock una sola vez.
2. [x] Ejecutar el test nuevo antes de la implementación y observar los rechazos esperados.
3. [x] En la migración, reemplazar `ventas_cliente_obligatorio` con una restricción diferible que admita `cliente_id IS NULL` solo para boletas menores a S/700 (o venta descartada); conservar todas las validaciones de la RPC wrapper.
4. [x] Permitir `cliente_objetivo` nulo en `crear_borrador_venta_con_comprobante` solo para boleta, validar el importe total del servidor antes de guardar el tipo y mantener factura con RUC válido obligatorio.
5. [x] En Ventas, mostrar el selector de cliente como opcional para boleta y explicar que desde S/700 se requiere identificación; mandar `null` cuando se elija venta de mostrador. No depender de un total calculado en frontend.
6. [x] Ejecutar pgTAP y agregar/ejecutar el E2E de guardar y confirmar una boleta simple sin cliente bajo S/700.

## Tarea 3 — Consulta visible de facturas y coherencia de IA

1. [x] Añadir prueba Deno que demuestre que la herramienta de borrador acepta cliente `null` solo como argumento opcional del flujo boleta; añadir prueba de instrucciones de IA para pedir tipo y permitir «boleta simple» sin cliente.
2. [x] Ejecutar primero las pruebas nuevas y verificar que fallan por el contrato actual.
3. [x] Mostrar «Consultar estado» solo a administración para facturas `emitido` pendientes; deshabilitar durante la operación y mostrar la respuesta guardada al terminar.
4. [x] Actualizar instrucciones del asistente para que pregunte cliente en factura y en boletas identificadas; si el usuario pide boleta simple, prepare sin cliente, y si el servidor informa que el monto es S/700 o más, solicite un cliente válido y reintente el borrador.
5. [x] Ajustar la herramienta `armar_borrador_venta` para enviar `cliente_objetivo: null` solo cuando corresponda a una boleta simple.
6. [x] Ejecutar `npm run functions:test`, `npm run functions:check`, E2E dirigido, lint, typecheck, build y formato de los archivos modificados.
7. [x] Actualizar alcance/spec y revisar el diff completo, sin incluir cambios anteriores ajenos.
