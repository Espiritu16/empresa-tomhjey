# Supabase

`config.toml` y las migraciones mantienen el backend reproducible en local. El esquema de
negocio todavía no está creado.

- `migrations/`: cambios SQL versionados; toda tabla del esquema expuesto debe tener RLS y
  políticas basadas en el modelo de acceso acordado.
- `functions/`: integraciones de servidor con NubeFacT y el proveedor de IA. Sus credenciales
  se administran como secretos de Supabase, nunca en el navegador ni en archivos versionados.
- `seed.sql`: reservado para datos de demostración locales cuando exista un esquema.

Usa el CLI fijado en `package.json` y descubre sus opciones con `npx supabase --help`.
