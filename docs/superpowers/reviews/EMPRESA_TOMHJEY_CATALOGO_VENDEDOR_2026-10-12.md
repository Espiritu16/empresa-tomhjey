# Revisión diferencial: catálogo del vendedor

Fecha: 2026-10-12  
Base revisada: `HEAD` antes de la migración `20261012151356`  
Alcance: políticas RLS, privilegios de columna, RPC de combinaciones, UI de productos y pruebas asociadas.

## Resultado

No encontré una ruta para que el vendedor cambie existencias o marque directamente
un producto simple como producto con combinaciones. La ampliación permite crear,
editar e inactivar productos, según el alcance acordado.

## Límites revisados

- La inserción directa exige rol vendedor y `creado_por = auth.uid()`.
- La política de actualización exige rol vendedor. Los privilegios existentes
  siguen excluyendo existencias y este cambio revoca escritura directa sobre
  `usa_combinaciones`.
- Un producto con combinaciones se crea mediante la RPC validada, ahora accesible
  para administrador y vendedor. La función mantiene validaciones, creación
  transaccional y `search_path` vacío.
- Los vendedores no reciben controles de creación de categorías ni existencias
  iniciales; rutas de configuración y usuarios mantienen su protección actual.
- Las pruebas SQL comprueban alta, edición, inactivación, rechazo de cambios de
  existencias y rechazo de escritura directa sobre `usa_combinaciones`. Otra
  prueba ejecuta el alta de combinaciones mediante RPC con rol vendedor.
- La prueba E2E de roles confirma edición e inactivación desde la interfaz,
  ocultamiento de controles administrativos y redirección de rutas restringidas.

## Impacto y riesgo residual

La superficie ampliada es el catálogo compartido de la empresa: un vendedor puede
modificar o inactivar productos creados por otros miembros. Esto es intencional
según la decisión del producto; el inventario sigue separado y solo se modifica
desde sus operaciones autorizadas.

Supabase Advisor conserva advertencias preexistentes sobre funciones
`SECURITY DEFINER` expuestas a `authenticated` y la protección de contraseñas
filtradas deshabilitada. La RPC ya existía con ejecución autenticada y el
control del rol se realiza dentro de la función. Estas advertencias requieren
una revisión separada; este cambio no alteró la política general.

## Verificación

- pgTAP local: 119 aserciones aprobadas.
- Playwright: flujos de usuarios/roles y productos aprobados.
- Lint, typecheck, compilación y formato aprobados antes del ajuste final del
  E2E; tras el ajuste final se volvió a ejecutar el E2E de productos y pasó.
- Migración aplicada al proyecto Supabase de demo y Worker desplegado en
  `https://tomhjay.proyectoutp.com`.
