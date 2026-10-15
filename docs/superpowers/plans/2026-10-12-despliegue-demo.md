# Despliegue de demo universitaria — Plan de implementación

> **Para agentes:** ejecutar este plan tarea por tarea en la sesión actual, con verificaciones entre tareas. El usuario autorizó desplegar la demo en `proyecto-universidad` y enlazar el frontend a `tomhjay.proyectoutp.com`.

**Objetivo:** publicar el MVP de Empresa Tomhjey como demo académica usando Cloudflare Workers para Next.js y Supabase para PostgreSQL, Auth y Edge Functions.

**Arquitectura:** conservar Next.js 16 y añadir la ruta de despliegue para Cloudflare Workers recomendada actualmente por Cloudflare, `vinext`, previa revisión de compatibilidad y prueba local. Aplicar las migraciones del repositorio al proyecto Supabase elegido, desplegar sus Edge Functions y configurar las URLs de Auth para el subdominio de la demo.

**Stack:** Next.js 16.4, React 19, TypeScript, vinext, Cloudflare Workers, Supabase CLI, PostgreSQL 17 y Supabase Edge Functions.

**Especificación:** `docs/superpowers/specs/2026-10-06-empresa-tomhjey-design.md` y `docs/alcance-mvp.md`.

## Restricciones globales

- La instancia es para presentación universitaria; no se habilita emisión fiscal real.
- El dominio exacto es `tomhjay.proyectoutp.com`; conservar los registros existentes de `proyectoutp.com`.
- El proyecto remoto Supabase confirmado por el usuario es `proyecto-universidad`.
- Las migraciones son las únicas fuentes de esquema; toda tabla conserva RLS y privilegios mínimos.
- No leer ni transmitir secretos de `.env.local` sin autorización explícita para sus valores y destinos concretos.
- No publicar claves privadas en `NEXT_PUBLIC_*`, código, logs, Git ni documentación.
- Mantener `npm run dev` y la configuración local de Supabase funcionales.

---

### Tarea 1: Preparar y validar el runtime de Cloudflare

**Archivos:**

- Modificar: `package.json`, `package-lock.json`, `next.config.ts` solo si la compatibilidad comprobada lo exige.
- Crear: `vite.config.ts`, configuración Wrangler/vinext y tipos de Cloudflare que genere la herramienta oficial.
- Verificar: `src/proxy.ts`, rutas App Router, documentación local de Next.js y build existente.

- [x] Revisar el reporte `vinext check` y conservar explícitamente el comportamiento de Next.js local.
- [x] Inicializar vinext para Cloudflare Workers según la guía oficial y registrar dependencias con npm.
- [x] Ejecutar `npm run build`, el build de vinext y el preview local de Workers.
- [x] Resolver incompatibilidades verificadas; no desplegar mientras fallen esas comprobaciones.

### Tarea 2: Aplicar el esquema y publicar las funciones de Supabase

**Archivos:**

- Leer: `supabase/migrations/*.sql`, `supabase/functions/README.md`, `.env.example` y `supabase/functions/.env.example`.
- Estado local ignorado: `supabase/.temp/project-ref` al vincular al proyecto remoto.
- Destino remoto: proyecto `proyecto-universidad` confirmado por el usuario.

- [x] Revisar operaciones destructivas y comprobar que el historial remoto no contiene migraciones del MVP.
- [x] Ejecutar la batería local de base de datos y funciones.
- [x] Vincular el CLI y aplicar las migraciones pendientes al proyecto confirmado.
- [x] Desplegar `facturacion`, `asistente` y `crear-usuario` con verificación JWT activa.
- [x] Configurar la URL del sitio para `https://tomhjay.proyectoutp.com`.

### Tarea 3: Completar configuración privada y pública

**Destinos:** secretos de Supabase Edge Functions y variables del Worker de Cloudflare.

- [x] Configurar URL remota y clave publicable de Supabase como variables del Worker.
- [x] Configurar `APP_URL=https://tomhjay.proyectoutp.com` en el Worker y en Supabase Edge Functions.
- [x] Configurar `OPENAI_API_KEY`, `OPENAI_MODEL`, NubeFacT en sandbox, `NUBEFACT_RUC_EMISOR` y `NUBEFACT_PERMITIR_PRODUCCION=false` únicamente en Supabase como secretos de Edge Functions.
- [x] Usar las credenciales autorizadas solo para los destinos indicados; no guardar valores en el repositorio.

### Tarea 4: Publicar y verificar la demo

**Destino:** Cloudflare Worker y hostname `tomhjay.proyectoutp.com`.

- [x] Desplegar el Worker con el hostname confirmado, sin alterar el apex ni los registros existentes.
- [ ] Completar login y rutas protegidas con una cuenta de demo.
- [x] Comprobar Supabase Auth sin autenticación de usuario y confirmar que las funciones mantienen JWT obligatorio.
- [x] Revisar `git diff --check`, `npm run lint`, `npm run typecheck`, `npm run format:check` y los builds; informar cualquier verificación no ejecutada.
- [x] Verificar HTTPS en `/`, `/acceso`, `/panel` y `/auth/confirm`.

## Límites conocidos

- Cloudflare recomienda vinext para Next.js en Workers y advierte que continúa en beta; la comprobación local del proyecto marcó compatibilidad del 95%, con soporte experimental incompleto para `cacheComponents`.
- El Worker `empresa-tomhjey` quedó publicado en `https://tomhjay.proyectoutp.com` y usa el proyecto remoto confirmado `proyecto-universidad`.
- El endpoint de salud de Supabase Auth respondió HTTP 200 y las páginas comprobadas respondieron HTTP 200. Falta iniciar sesión con una cuenta de demo y probar los flujos autenticados; no se emitieron comprobantes durante esta verificación.
- vinext continúa en beta y el proyecto conserva la limitación experimental de `cacheComponents` detectada durante la validación local.
