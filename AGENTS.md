<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Empresa Tomhjey

## Fuente de verdad

- Alcance funcional: `docs/alcance-mvp.md`.
- Arquitectura backend/frontend: `docs/superpowers/specs/2026-10-06-empresa-tomhjey-design.md`.
- Configuración de Supabase local: `supabase/config.toml`.

## Stack y comandos

- Next.js 16 App Router, TypeScript, npm; Supabase PostgreSQL 17, Auth y Edge Functions.
- `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`.
- `npm run test:e2e` corre Playwright contra la aplicación y Supabase locales; inicia antes
  Supabase con `npm run supabase:start`. La suite crea y elimina cuentas temporales.
- `npm run format` aplica Prettier; `npm run format:check` lo comprueba.
- `npm run supabase:start|stop|status` controla el stack local; requiere Docker.
- `npm run supabase:reset` recrea la base local y borra sus datos de desarrollo.
- `npm run supabase:test` ejecuta pgTAP; `npm run supabase:lint` valida el esquema local.
- `npm run functions:test|check` ejecuta tests Deno simulados y verifica tipos de Edge Functions.
- `npm run supabase:functions:serve` sirve las funciones con el `.env.local` de la raíz.

## Arquitectura y seguridad

- `src/app/` contiene rutas; `src/funcionalidades/` agrupa código por módulo de negocio.
- `src/compartido/` contiene solo código reutilizado por más de una funcionalidad.
- `supabase/migrations/` versiona el esquema; `supabase/functions/` aloja integraciones privadas.
- Toda tabla expuesta requiere RLS y políticas ajustadas al acceso de la empresa y sus roles.
- No uses `user_metadata` para decisiones de autorización; los permisos deben venir de una
  fuente controlada por el servidor o de la base de datos.
- Nunca expongas claves privadas en `NEXT_PUBLIC_*` ni en código del navegador.
- El proxy de Supabase actualiza cookies; no sustituye la autorización de cada operación.
- La empresa opera como instancia única; no agregues `tenant_id`, planes, suscripciones ni locales.
- Los únicos roles son `administrador` y `vendedor`; `perfiles` es su fuente de verdad.
- El registro público está deshabilitado. Auth crea perfiles como vendedor y la Edge Function
  `crear-usuario` permite al administrador crear cuentas y asignar su rol desde `perfiles`;
  nunca derives roles de `user_metadata` ni permitas que el cliente cambie roles.
- Los saldos de existencias solo cambian por RPC que registra movimientos. Los precios,
  impuestos, totales y correlativos se calculan o reservan en Postgres.
- Los borradores usan `crear_borrador_venta`; confirmar usa `confirmar_venta`, que descuenta
  stock y registra movimientos atómicamente. Una confirmación repetida es idempotente.
- El vendedor consulta sus ventas y administración consulta todas. Toda RPC que reciba un id
  valida permiso dentro del backend.
- `facturacion`, `asistente` y `crear-usuario` requieren JWT. NubeFacT, OpenAI y service role
  solo se usan del lado servidor.

## Convenciones

- Nombres propios de dominio y mensajes en español; conserva literales del framework y APIs.
- Commits: `tipo(alcance): descripción`, en español, con tipos técnicos como `feat` y `fix`.
- Revisa dependencias y capacidades existentes antes de añadir otra integración o capa.
- Usa la versión local de Prettier; no reformatees archivos ajenos al cambio.
- Agrega migraciones como archivos nuevos. Cada tabla expuesta lleva RLS, policies y grants
  mínimos en la misma migración; las pruebas pgTAP viven en `supabase/tests/`.
- El esquema, rutas, roles y flujos de negocio no se anticipan con capas o archivos vacíos.
