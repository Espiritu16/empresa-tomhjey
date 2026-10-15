# Identificación de cliente durante la venta — Plan de implementación

> **Para agentes de desarrollo:** SUBSKILL REQUERIDA: usar `superpowers:executing-plans` para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** Permitir que boletas pidan DNI y facturas RUC, consulten SUNAT para clientes nuevos y los guarden junto con el borrador, mientras el buscador de clientes solo se abre al enfocarlo o escribir.

**Arquitectura:** El cliente buscará coincidencias locales filtradas por el tipo de comprobante y consultará SUNAT mediante la ruta autenticada existente cuando no encuentre al cliente. Una nueva RPC transaccional reutilizará o creará el cliente y guardará el borrador; un índice único parcial evitará duplicados por documento. Boleta simple conservará el flujo anónimo actual.

**Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase PostgreSQL 17, SQL versionado, Prettier.

**Spec:** `docs/superpowers/specs/2026-10-06-empresa-tomhjey-design.md`

## Restricciones globales

- La instancia es única; no agregar `tenant_id`, planes, suscripciones ni locales.
- Los únicos roles son `administrador` y `vendedor`; la autorización se valida en el servidor/base de datos.
- Las operaciones de negocio se realizan mediante RPC y los datos se protegen con RLS.
- Las consultas de documentos requieren sesión; secretos y service role no se exponen al navegador.
- No tocar producción, Supabase remoto, despliegues ni comprobantes reales.
- Respetar los cambios preexistentes del árbol de trabajo.

---

### Tarea 1: Guardado transaccional por documento

**Archivos:**

- Crear: migración Supabase generada con `supabase migration new`.
- Crear: `docs/superpowers/plans/2026-10-14-identificacion-cliente-venta.md`.

**Interfaz:**

- Consume: `public.crear_borrador_venta_con_comprobante(uuid, jsonb, text, uuid)`.
- Produce: RPC `public.crear_borrador_venta_con_documento(text, text, text, text, jsonb, text, uuid)` que crea/reutiliza DNI/RUC y guarda el borrador en una transacción.

- [ ] Añadir índice único parcial por tipo y número para documentos DNI/RUC, verificando duplicados existentes sin borrarlos.
- [ ] Añadir RPC que permita solo administrador/vendedor activo, valide DNI de 8 dígitos o RUC con checksum y prefijo 10/20, y requiera nombre consultado no vacío.
- [ ] Reutilizar el cliente activo con el mismo documento o insertar uno nuevo; rechazar documentos asociados a cliente inactivo.
- [ ] Invocar la RPC de borrador existente en la misma transacción y otorgar ejecución solo a `authenticated`.
- [ ] Añadir trigger diferido para que las rutas existentes también exijan DNI en boletas y RUC 10/20 en facturas; conservar boleta simple sin cliente.

### Tarea 2: Captura de DNI/RUC en el modal

**Archivos:**

- Modificar: `src/funcionalidades/ventas/pagina-ventas.tsx`.
- Modificar: `supabase/functions/asistente/proveedor.ts` y `supabase/functions/asistente/herramientas.ts` para que el asistente pida el documento requerido.
- No modificar: `/api/clientes/consultar-documento`, que ya autentica y consulta SUNAT.

**Interfaz:**

- Consume: ruta autenticada existente `{ tipoDocumento, numeroDocumento } -> { nombre, direccion }`.
- Produce: búsqueda local filtrada por boleta/factura y guardado del nuevo cliente usando la RPC de la Tarea 1.

- [ ] Filtrar clientes locales a DNI al elegir boleta y a RUC 10/20 al elegir factura.
- [ ] Mantener la lista oculta hasta enfocar o escribir; cerrar al seleccionar y soportar flechas, Enter y Escape.
- [ ] Para un documento válido sin coincidencia local, permitir consultar SUNAT y mostrar nombre/documento antes de guardar.
- [ ] Validar DNI/RUC y selección de cliente al guardar; hacer el guardado de cliente y borrador por la RPC transaccional.
- [ ] Limpiar selección y resultado de consulta al cambiar comprobante; conservar boleta simple anónima.

### Tarea 3: Revisión del cambio

**Archivos:**

- Revisar el diff de la migración y `src/funcionalidades/ventas/pagina-ventas.tsx`.

- [ ] Ejecutar typecheck, lint y Prettier solo sobre archivos del alcance.
- [ ] Revisar que `git diff` no incluya archivos ajenos ni cambios en `.env`.
- [ ] Informar que no se ejecutaron pruebas ni se aplicó la migración a ninguna base de datos.
