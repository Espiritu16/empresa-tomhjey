<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Empresa Tomhjey

## Fuente de verdad

- Alcance funcional: `docs/alcance-mvp.md`.
- Configuración de Supabase local: `supabase/config.toml`.

## Stack y comandos

- Next.js 16 App Router, TypeScript, npm; Supabase PostgreSQL, Auth y Edge Functions.
- `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`.
- `npm run format` aplica Prettier; `npm run format:check` lo comprueba.
- `npm run supabase:start|stop|status` controla el stack local; requiere Docker.

## Arquitectura y seguridad

- `src/app/` contiene rutas; `src/funcionalidades/` agrupa código por módulo de negocio.
- `src/compartido/` contiene solo código reutilizado por más de una funcionalidad.
- `supabase/migrations/` versiona el esquema; `supabase/functions/` aloja integraciones privadas.
- Toda tabla expuesta requiere RLS y políticas ajustadas al acceso de la empresa y sus roles.
- No uses `user_metadata` para decisiones de autorización; los permisos deben venir de una
  fuente controlada por el servidor o de la base de datos.
- Nunca expongas claves privadas en `NEXT_PUBLIC_*` ni en código del navegador.
- El proxy de Supabase actualiza cookies; no sustituye la autorización de cada operación.

## Convenciones

- Nombres propios de dominio y mensajes en español; conserva literales del framework y APIs.
- Commits: `tipo(alcance): descripción`, en español, con tipos técnicos como `feat` y `fix`.
- Revisa dependencias y capacidades existentes antes de añadir otra integración o capa.
- Usa la versión local de Prettier; no reformatees archivos ajenos al cambio.
- El esquema, rutas, roles y flujos de negocio no se anticipan con capas o archivos vacíos.
