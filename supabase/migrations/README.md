# Migraciones

El esquema se versiona en archivos `<timestamp>_<nombre>.sql`. Usa
`npx supabase migration new <nombre>` para generar el timestamp y deja los cambios de esquema,
RLS y grants en la misma migración.

- Las tablas de negocio van en `public`, con RLS activado en la migración.
- Las funciones auxiliares internas viven en `private` y fijan `search_path`.
- Las operaciones de varias filas son RPC transaccionales con permisos y validaciones propios.
- No edites una migración que ya se compartió o aplicó a un entorno persistente: agrega otra.
- Añade pruebas pgTAP en `supabase/tests/` y ejecuta `npm run supabase:test` contra el stack
  local antes de enviar el cambio.

La base de desarrollo local se puede recrear con `npm run supabase:reset`; ese comando borra
los datos locales de Supabase.
