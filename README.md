# Empresa Tomhjey

Aplicación operativa para una empresa: ventas, inventario, facturación electrónica con
NubeFacT y asistencia con IA. Este repositorio es independiente de Trayecto SaaS.

## Stack

- Next.js 16 con App Router y TypeScript.
- Supabase: PostgreSQL, Auth y Edge Functions.
- `@supabase/ssr` para sesiones de Supabase en Next.js.
- Prettier local para el formato.
- NubeFacT como integración de facturación definida para el MVP.

## Requisitos

- Node.js 20.9 o posterior.
- npm 11.19.0, fijado en `package.json`.
- Docker para levantar Supabase localmente.

## Preparar el entorno

```bash
npm install
cp .env.example .env.local
```

Completa en `.env.local` la URL y la clave publicable del proyecto Supabase. No coloques
claves privadas de NubeFacT o del proveedor de IA en variables `NEXT_PUBLIC_*`; esas
credenciales se configurarán como secretos de las Edge Functions. Conserva
`APP_URL=http://127.0.0.1:3000` para que los enlaces de invitación vuelvan al mismo host local
que usa Auth.

## Desarrollo local

```bash
npm run supabase:start
npm run dev
```

La aplicación queda en `http://127.0.0.1:3000`. Para detener Supabase local:

```bash
npm run supabase:stop
```

## Comprobaciones disponibles

```bash
npm run lint
npm run typecheck
npm run format:check
npm run build
```

Para aplicar el formato con la versión local de Prettier:

```bash
npm run format
```

## Estructura

- `src/app/`: rutas y layouts de Next.js.
- `src/funcionalidades/`: módulos de negocio organizados por capacidad.
- `src/compartido/`: código utilizado por más de una funcionalidad, incluidos los clientes
  de Supabase.
- `supabase/migrations/`: cambios versionados del esquema PostgreSQL.
- `supabase/functions/`: integraciones de servidor que requieren secretos, como NubeFacT
  y el proveedor de IA.
- `docs/alcance-mvp.md`: alcance funcional acordado.

## Fuente de verdad

El alcance está en [`docs/alcance-mvp.md`](docs/alcance-mvp.md). Las instrucciones para
agentes están en [`AGENTS.md`](AGENTS.md).
