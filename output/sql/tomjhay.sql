-- =============================================================================
-- Empresa Tomhjey — diccionario de datos y esquema SQL del MVP
-- =============================================================================
-- Fuente: esquema Supabase local, con migraciones locales y remotas sincronizadas
-- hasta 2026-10-12. Incluye DDL de public y funciones auxiliares de private:
-- tablas, índices, claves, restricciones, funciones, políticas RLS y permisos.
-- No incluye filas de negocio, cuentas de Auth ni credenciales.
--
-- Dependencias administradas por Supabase: auth.uid(), roles authenticated y
-- service_role, y la extensión pgcrypto (instalada en el esquema extensions).
-- Este archivo está pensado para un proyecto Supabase; no es un bootstrap para
-- PostgreSQL vacío ni reemplaza las Edge Functions de la aplicación.
--
-- Tablas del diccionario:
--   perfiles               Perfil, rol y estado de cada usuario autenticado.
--   empresa                Datos comerciales y parámetros fiscales del negocio.
--   categorias             Categorías para clasificar productos.
--   productos              Catálogo de productos, precios o stock sin combinaciones.
--   opciones_producto      Ejes configurables de combinación (por ejemplo, talla/color).
--   valores_opcion         Valores disponibles para cada eje de un producto.
--   combinaciones          SKU, precio y existencias de cada combinación vendible.
--   clientes               Datos de identificación y contacto de clientes.
--   ventas                 Cabecera de ventas, cliente, totales y estado.
--   lineas_venta           Detalle congelado de productos, cantidades e importes.
--   movimientos_inventario Historial de ajustes y salidas de existencias.
--   series_comprobante     Series y correlativos para boletas y facturas.
--   comprobantes           Solicitudes, estados y respuestas de emisión/consulta.
--   auditoria              Registro de acciones relevantes realizadas en el sistema.
--   conversaciones         Conversaciones del asistente asociadas a un usuario.
--   mensajes               Mensajes de usuario/asistente y vínculo con borradores.
--   invitaciones           Registro auxiliar de invitaciones/roles de usuarios.
--
-- Para obtener el diccionario técnico completo (columna, tipo SQL, nulabilidad,
-- valor por defecto y comentarios), el último SELECT consulta los catálogos de
-- PostgreSQL después de crear el esquema.
-- =============================================================================

--
-- PostgreSQL database dump
--

-- \restrict Mi4iOdD6JUksxHGBMi1jhHlTvzcaL3w3LiRYcx92Y72bOdU55libAAuuclvbY5t

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: crear_perfil_auth(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."crear_perfil_auth"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  nombre_perfil text;
begin
  nombre_perfil := nullif(trim(new.raw_user_meta_data ->> 'nombre'), '');
  if nombre_perfil is null then
    nombre_perfil := coalesce(nullif(split_part(new.email, '@', 1), ''), 'Usuario');
  end if;

  insert into public.perfiles (id, nombre, correo)
  values (new.id, nombre_perfil, lower(new.email))
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "private"."crear_perfil_auth"() OWNER TO "postgres";

--
-- Name: ruc_valido("text"); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."ruc_valido"("valor" "text") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
declare
  factores integer[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  suma integer := 0;
  resto integer;
  digito integer;
begin
  if valor is null or valor !~ '^[0-9]{11}$' or substring(valor from 1 for 2) not in ('10', '15', '17', '20') then
    return false;
  end if;
  for indice in 1..10 loop
    suma := suma + substring(valor from indice for 1)::integer * factores[indice];
  end loop;
  resto := 11 - (suma % 11);
  digito := case resto when 10 then 0 when 11 then 1 else resto end;
  return digito = substring(valor from 11 for 1)::integer;
end;
$_$;


ALTER FUNCTION "private"."ruc_valido"("valor" "text") OWNER TO "postgres";

--
-- Name: sincronizar_correo_auth(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."sincronizar_correo_auth"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.perfiles
  set correo = lower(new.email), actualizado_en = now()
  where id = new.id;
  return new;
end;
$$;


ALTER FUNCTION "private"."sincronizar_correo_auth"() OWNER TO "postgres";

--
-- Name: tiene_rol("text"[]); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."tiene_rol"("roles_permitidos" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = (select auth.uid())
      and p.activo
      and p.rol = any (roles_permitidos)
  );
$$;


ALTER FUNCTION "private"."tiene_rol"("roles_permitidos" "text"[]) OWNER TO "postgres";

--
-- Name: usuario_activo(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."usuario_activo"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = (select auth.uid())
      and p.activo
  );
$$;


ALTER FUNCTION "private"."usuario_activo"() OWNER TO "postgres";

--
-- Name: validar_cambio_estado_cliente(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."validar_cambio_estado_cliente"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.activo is distinct from old.activo
    and not (select private.tiene_rol(array['administrador'])) then
    raise exception using
      errcode = '42501',
      message = 'Solo administración puede activar o inactivar clientes.';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."validar_cambio_estado_cliente"() OWNER TO "postgres";

--
-- Name: validar_documento_cliente(); Type: FUNCTION; Schema: private; Owner: postgres
--

CREATE OR REPLACE FUNCTION "private"."validar_documento_cliente"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
begin
  if tg_op = 'UPDATE'
    and old.tipo_documento is not distinct from new.tipo_documento
    and old.numero_documento is not distinct from new.numero_documento then
    return new;
  end if;

  if new.tipo_documento = 'dni'
    and new.numero_documento !~ '^[0-9]{8}$' then
    raise exception using errcode = '23514', message = 'El DNI debe contener ocho dígitos.';
  end if;

  if new.tipo_documento = 'ruc'
    and not private.ruc_valido(new.numero_documento) then
    raise exception using errcode = '23514', message = 'El RUC debe tener once dígitos válidos.';
  end if;

  return new;
end;
$_$;


ALTER FUNCTION "private"."validar_documento_cliente"() OWNER TO "postgres";

--
-- Name: ajustar_existencias("uuid", "uuid", numeric, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."ajustar_existencias"("producto_objetivo" "uuid", "combinacion_objetivo" "uuid", "cambio" numeric, "razon" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  movimiento_id uuid := gen_random_uuid();
  existencias_nuevas numeric(12, 3);
begin
  if not (select private.tiene_rol(array['administrador'])) then
    raise exception using errcode = '42501', message = 'Solo administración puede ajustar existencias.';
  end if;
  if cambio = 0 or nullif(trim(razon), '') is null then
    raise exception using errcode = '22023', message = 'El ajuste debe tener cantidad y motivo.';
  end if;

  if combinacion_objetivo is null then
    update public.productos
    set existencias = existencias + cambio, actualizado_en = now()
    where id = producto_objetivo and not usa_combinaciones and activo
      and existencias + cambio >= 0
    returning existencias into existencias_nuevas;
  else
    update public.combinaciones
    set existencias = existencias + cambio
    where id = combinacion_objetivo and producto_id = producto_objetivo and activa
      and existencias + cambio >= 0
    returning existencias into existencias_nuevas;
  end if;

  if not found then
    raise exception using errcode = '22023', message = 'El producto no existe, no está activo o el ajuste dejaría stock negativo.';
  end if;

  insert into public.movimientos_inventario (
    id, producto_id, combinacion_id, tipo, cantidad,
    existencias_resultantes, motivo, usuario_id
  ) values (
    movimiento_id, producto_objetivo, combinacion_objetivo, 'ajuste',
    cambio, existencias_nuevas, trim(razon), (select auth.uid())
  );
  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values ((select auth.uid()), 'ajustar_existencias', 'producto', producto_objetivo,
    jsonb_build_object('combinacion_id', combinacion_objetivo, 'cambio', cambio, 'motivo', trim(razon)));
  return movimiento_id;
end;
$$;


ALTER FUNCTION "public"."ajustar_existencias"("producto_objetivo" "uuid", "combinacion_objetivo" "uuid", "cambio" numeric, "razon" "text") OWNER TO "postgres";

--
-- Name: asistente_buscar_productos("text", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."asistente_buscar_productos"("texto_busqueda" "text", "max_resultados" integer DEFAULT 8) RETURNS TABLE("producto_id" "uuid", "combinacion_id" "uuid", "nombre" "text", "sku" "text", "precio" numeric, "existencias" numeric, "unidad_medida" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select p.id, c.id, p.nombre || case when c.id is null then '' else ' ' || coalesce((
    select string_agg(vo.valor, ' ' order by op.posicion)
    from public.valores_opcion vo
    join public.opciones_producto op on op.id = vo.opcion_id
    where vo.id in (c.valor_opcion_1_id, c.valor_opcion_2_id)
  ), '') end,
  coalesce(c.sku, p.sku), coalesce(c.precio, p.precio), coalesce(c.existencias, p.existencias), p.unidad_medida
  from public.productos p
  left join public.combinaciones c on c.producto_id = p.id and c.activa
  where p.activo
    and (p.nombre ilike '%' || trim(texto_busqueda) || '%' or p.sku ilike '%' || trim(texto_busqueda) || '%'
      or c.sku ilike '%' || trim(texto_busqueda) || '%')
  order by p.nombre, c.sku
  limit greatest(1, least(coalesce(max_resultados, 8), 20));
$$;


ALTER FUNCTION "public"."asistente_buscar_productos"("texto_busqueda" "text", "max_resultados" integer) OWNER TO "postgres";

--
-- Name: asistente_consultar_modulo("text", "text", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."asistente_consultar_modulo"("modulo" "text", "busqueda" "text" DEFAULT NULL::"text", "desde" timestamp with time zone DEFAULT NULL::timestamp with time zone, "hasta" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  inicio_periodo timestamptz;
  fin_periodo timestamptz;
  resultado jsonb;
begin
  if modulo is null or modulo not in (
    'inicio', 'productos', 'inventario', 'clientes', 'ventas',
    'facturacion', 'reportes', 'empresa', 'usuarios'
  ) then
    raise exception using errcode = '22023', message = 'El módulo no está disponible para consulta.';
  end if;

  if busqueda is not null and length(trim(busqueda)) > 120 then
    raise exception using errcode = '22023', message = 'La búsqueda es demasiado larga.';
  end if;

  if modulo in ('empresa', 'usuarios') and not exists (
    select 1 from public.perfiles p
    where p.id = (select auth.uid()) and p.rol = 'administrador' and p.activo
  ) then
    raise exception using errcode = '42501', message = 'Esta consulta requiere el rol de administrador.';
  end if;

  if modulo in ('inicio', 'ventas', 'facturacion', 'reportes') then
    inicio_periodo := coalesce(
      desde,
      date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima'
    );
    fin_periodo := coalesce(hasta, inicio_periodo + interval '1 day');
    if inicio_periodo >= fin_periodo then
      raise exception using errcode = '22023', message = 'El periodo indicado no es válido.';
    end if;
  end if;

  case
    when modulo = 'inicio' then
      resultado := jsonb_build_object(
        'modulo', modulo,
        'catalogo', public.asistente_resumen_catalogo(),
        'ventas', public.asistente_resumen_ventas(inicio_periodo, fin_periodo)
      );

    when modulo in ('productos', 'inventario') then
      select jsonb_build_object(
        'modulo', modulo,
        'productos_activos', (select count(*) from public.productos p where p.activo),
        'productos', coalesce((
          select jsonb_agg(to_jsonb(producto))
          from (
            select
              p.id as producto_id,
              p.nombre,
              p.sku,
              p.unidad_medida,
              p.usa_combinaciones,
              p.precio,
              p.existencias,
              p.stock_minimo,
              p.activo,
              coalesce((
                select jsonb_agg(jsonb_build_object(
                  'combinacion_id', c.id,
                  'nombre', p.nombre || ' ' || coalesce((
                    select string_agg(op.nombre || ' ' || vo.valor, ' ' order by op.posicion)
                    from public.valores_opcion vo
                    join public.opciones_producto op on op.id = vo.opcion_id
                    where vo.id in (c.valor_opcion_1_id, c.valor_opcion_2_id)
                  ), ''),
                  'sku', c.sku,
                  'precio', c.precio,
                  'existencias', c.existencias,
                  'stock_minimo', c.stock_minimo,
                  'activa', c.activa
                ) order by c.sku)
                from public.combinaciones c
                where c.producto_id = p.id and c.activa
              ), '[]'::jsonb) as combinaciones
            from public.productos p
            where p.activo and (
              nullif(trim(busqueda), '') is null
              or p.nombre ilike '%' || trim(busqueda) || '%'
              or p.sku ilike '%' || trim(busqueda) || '%'
              or exists (
                select 1 from public.combinaciones c
                where c.producto_id = p.id and c.activa
                  and c.sku ilike '%' || trim(busqueda) || '%'
              )
            )
            order by p.nombre
            limit 20
          ) producto
        ), '[]'::jsonb)
      ) || case when modulo = 'inventario' then jsonb_build_object(
        'movimientos', coalesce((
          select jsonb_agg(to_jsonb(movimiento))
          from (
            select
              m.tipo,
              p.nombre as producto,
              coalesce(c.sku, p.sku) as sku,
              m.cantidad,
              m.existencias_resultantes as existencias,
              m.motivo,
              m.creado_en as fecha
            from public.movimientos_inventario m
            join public.productos p on p.id = m.producto_id
            left join public.combinaciones c on c.id = m.combinacion_id
            where nullif(trim(busqueda), '') is null
              or p.nombre ilike '%' || trim(busqueda) || '%'
              or p.sku ilike '%' || trim(busqueda) || '%'
              or c.sku ilike '%' || trim(busqueda) || '%'
            order by m.creado_en desc
            limit 20
          ) movimiento
        ), '[]'::jsonb)
      ) else '{}'::jsonb end
      into resultado;

    when modulo = 'clientes' then
      select jsonb_build_object(
        'modulo', modulo,
        'total', (select count(*) from public.clientes c where nullif(trim(busqueda), '') is null or c.nombre ilike '%' || trim(busqueda) || '%'),
        'clientes', coalesce((
          select jsonb_agg(to_jsonb(cliente))
          from (
            select
              c.id as cliente_id,
              c.nombre,
              c.activo,
              (select count(*) from public.ventas v where v.cliente_id = c.id and v.estado = 'confirmada') as ventas_confirmadas
            from public.clientes c
            where nullif(trim(busqueda), '') is null or c.nombre ilike '%' || trim(busqueda) || '%'
            order by c.nombre
            limit 20
          ) cliente
        ), '[]'::jsonb)
      ) into resultado;

    when modulo = 'ventas' then
      select jsonb_build_object(
        'modulo', modulo,
        'periodo_desde', inicio_periodo,
        'periodo_hasta', fin_periodo,
        'por_estado', coalesce((
          select jsonb_object_agg(estado, cantidad)
          from (select v.estado, count(*) as cantidad from public.ventas v
            where v.creado_en >= inicio_periodo and v.creado_en < fin_periodo
            group by v.estado) estados
        ), '{}'::jsonb),
        'ventas', coalesce((
          select jsonb_agg(to_jsonb(venta))
          from (
            select v.id as venta_id, v.estado, v.moneda, v.total, v.creado_en,
              v.confirmado_en, v.cliente_nombre,
              coalesce((select jsonb_agg(jsonb_build_object(
                'producto', l.descripcion_congelada,
                'cantidad', l.cantidad,
                'total', l.total
              ) order by l.creado_en) from public.lineas_venta l where l.venta_id = v.id), '[]'::jsonb) as productos
            from public.ventas v
            where v.creado_en >= inicio_periodo and v.creado_en < fin_periodo
              and (nullif(trim(busqueda), '') is null or v.cliente_nombre ilike '%' || trim(busqueda) || '%')
            order by v.creado_en desc
            limit 20
          ) venta
        ), '[]'::jsonb),
        'resumen_confirmadas', public.asistente_resumen_ventas(inicio_periodo, fin_periodo)
      ) into resultado;

    when modulo = 'facturacion' then
      select jsonb_build_object(
        'modulo', modulo,
        'periodo_desde', inicio_periodo,
        'periodo_hasta', fin_periodo,
        'por_estado', coalesce((
          select jsonb_object_agg(estado, cantidad)
          from (select c.estado, count(*) as cantidad from public.comprobantes c
            where c.creado_en >= inicio_periodo and c.creado_en < fin_periodo
            group by c.estado) estados
        ), '{}'::jsonb),
        'comprobantes', coalesce((
          select jsonb_agg(to_jsonb(comprobante))
          from (
            select c.id as comprobante_id, c.tipo, c.serie, c.numero, c.estado,
              c.error_publico, c.creado_en, c.actualizado_en
            from public.comprobantes c
            where c.creado_en >= inicio_periodo and c.creado_en < fin_periodo
              and (nullif(trim(busqueda), '') is null
                or c.serie ilike '%' || trim(busqueda) || '%'
                or (c.serie || '-' || c.numero::text) ilike '%' || trim(busqueda) || '%')
            order by c.creado_en desc
            limit 20
          ) comprobante
        ), '[]'::jsonb)
      ) into resultado;

    when modulo = 'reportes' then
      select jsonb_build_object(
        'modulo', modulo,
        'periodo_desde', inicio_periodo,
        'periodo_hasta', fin_periodo,
        'resumen', public.asistente_resumen_ventas(inicio_periodo, fin_periodo),
        'productos_vendidos', coalesce((
          select jsonb_agg(to_jsonb(detalle))
          from (
            select descripcion as producto, moneda, ventas, unidades, total
            from public.reporte_ventas(inicio_periodo, fin_periodo)
            order by unidades desc, descripcion
            limit 20
          ) detalle
        ), '[]'::jsonb)
      ) into resultado;

    when modulo = 'empresa' then
      select jsonb_build_object(
        'modulo', modulo,
        'empresa', jsonb_build_object(
          'nombre', e.nombre,
          'ruc', e.ruc,
          'moneda', e.moneda,
          'igv_activo', e.igv_activo,
          'igv_porcentaje', e.igv_porcentaje,
          'precios_incluyen_igv', e.precios_incluyen_igv,
          'direccion_configurada', nullif(trim(coalesce(e.direccion, '')), '') is not null,
          'telefono_configurado', nullif(trim(coalesce(e.telefono, '')), '') is not null
        )
      ) into resultado
      from public.empresa e where e.unica;

    when modulo = 'usuarios' then
      select jsonb_build_object(
        'modulo', modulo,
        'usuarios', coalesce(jsonb_agg(jsonb_build_object(
          'nombre', p.nombre,
          'rol', p.rol,
          'activo', p.activo
        ) order by p.nombre), '[]'::jsonb),
        'total', count(*)
      ) into resultado
      from public.perfiles p;
  end case;

  return coalesce(resultado, jsonb_build_object('modulo', modulo, 'datos', null));
end;
$$;


ALTER FUNCTION "public"."asistente_consultar_modulo"("modulo" "text", "busqueda" "text", "desde" timestamp with time zone, "hasta" timestamp with time zone) OWNER TO "postgres";

--
-- Name: asistente_resumen_catalogo(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."asistente_resumen_catalogo"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with productos_visibles as (
    select
      p.id,
      p.usa_combinaciones,
      p.existencias,
      p.stock_minimo,
      exists (
        select 1
        from public.combinaciones c
        where c.producto_id = p.id
          and c.activa
          and c.existencias <= c.stock_minimo
      ) as combinacion_baja,
      exists (
        select 1
        from public.combinaciones c
        where c.producto_id = p.id
          and c.activa
          and c.existencias <= 0
      ) as combinacion_agotada
    from public.productos p
    where p.activo
  )
  select jsonb_build_object(
    'productos_activos', count(*),
    'productos_con_stock_bajo', count(*) filter (
      where (not p.usa_combinaciones and p.existencias <= p.stock_minimo)
        or (p.usa_combinaciones and p.combinacion_baja)
    ),
    'productos_agotados', count(*) filter (
      where (not p.usa_combinaciones and p.existencias <= 0)
        or (p.usa_combinaciones and p.combinacion_agotada)
    ),
    'combinaciones_activas', (
      select count(*)
      from public.combinaciones c
      join public.productos producto on producto.id = c.producto_id
      where producto.activo and c.activa
    ),
    'detalle_reposicion', coalesce((
      select jsonb_agg(to_jsonb(detalle))
      from (
        select
          p.nombre || case when c.id is null then '' else ' ' || coalesce((
            select string_agg(op.nombre || ' ' || vo.valor, ' ' order by op.posicion)
            from public.valores_opcion vo
            join public.opciones_producto op on op.id = vo.opcion_id
            where vo.id in (c.valor_opcion_1_id, c.valor_opcion_2_id)
          ), '') end as producto,
          coalesce(c.sku, p.sku) as sku,
          coalesce(c.existencias, p.existencias) as existencias,
          coalesce(c.stock_minimo, p.stock_minimo) as stock_minimo,
          p.unidad_medida
        from public.productos p
        left join public.combinaciones c
          on c.producto_id = p.id and c.activa
        where p.activo and (
          (not p.usa_combinaciones and p.existencias <= p.stock_minimo)
          or (p.usa_combinaciones and c.id is not null and c.existencias <= c.stock_minimo)
        )
        order by p.nombre, c.sku
        limit 20
      ) detalle
    ), '[]'::jsonb)
  )
  from productos_visibles p;
$$;


ALTER FUNCTION "public"."asistente_resumen_catalogo"() OWNER TO "postgres";

--
-- Name: asistente_resumen_ventas(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."asistente_resumen_ventas"("desde" timestamp with time zone, "hasta" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with ventas_periodo as (
    select v.total, v.moneda
    from public.ventas v
    where v.estado = 'confirmada'
      and v.confirmado_en >= desde and v.confirmado_en < hasta
  ),
  totales as (
    select moneda, sum(total) as total
    from ventas_periodo
    group by moneda
  )
  select jsonb_build_object(
    'cantidad', (select count(*) from ventas_periodo),
    'total', case
      when (select count(*) from totales) <= 1
        then coalesce((select sum(total) from totales), 0)
      else null
    end,
    'totales_por_moneda', coalesce(
      (select jsonb_object_agg(moneda, total) from totales),
      '{}'::jsonb
    ),
    'periodo_desde', desde,
    'periodo_hasta', hasta
  );
$$;


ALTER FUNCTION "public"."asistente_resumen_ventas"("desde" timestamp with time zone, "hasta" timestamp with time zone) OWNER TO "postgres";

--
-- Name: cambiar_estado_cliente("uuid", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."cambiar_estado_cliente"("cliente_objetivo" "uuid", "activar" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if not (select private.tiene_rol(array['administrador'])) then
    raise exception using errcode = '42501', message = 'Solo administración puede gestionar clientes.';
  end if;

  update public.clientes
  set activo = activar, actualizado_en = now()
  where id = cliente_objetivo;

  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró el cliente para actualizar.';
  end if;
end;
$$;


ALTER FUNCTION "public"."cambiar_estado_cliente"("cliente_objetivo" "uuid", "activar" boolean) OWNER TO "postgres";

--
-- Name: cambiar_estado_vendedor("uuid", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."cambiar_estado_vendedor"("usuario_objetivo" "uuid", "activar" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not (select private.tiene_rol(array['administrador'])) then
    raise exception using errcode = '42501', message = 'Solo administración puede gestionar el equipo.';
  end if;
  update public.perfiles
  set activo = activar, actualizado_en = now()
  where id = usuario_objetivo and rol = 'vendedor';
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró un vendedor para actualizar.';
  end if;
end;
$$;


ALTER FUNCTION "public"."cambiar_estado_vendedor"("usuario_objetivo" "uuid", "activar" boolean) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: series_comprobante; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."series_comprobante" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text" NOT NULL,
    "serie" "text" NOT NULL,
    "siguiente_numero" bigint DEFAULT 1 NOT NULL,
    "activa" boolean DEFAULT true NOT NULL,
    "actualizado_por" "uuid",
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "series_comprobante_serie_check" CHECK (("serie" ~ '^[BF][A-Z0-9]{3}$'::"text")),
    CONSTRAINT "series_comprobante_siguiente_numero_check" CHECK (("siguiente_numero" > 0)),
    CONSTRAINT "series_comprobante_tipo_check" CHECK (("tipo" = ANY (ARRAY['boleta'::"text", 'factura'::"text"])))
);


ALTER TABLE "public"."series_comprobante" OWNER TO "postgres";

--
-- Name: configurar_serie_comprobante("uuid", "text", "text", bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."configurar_serie_comprobante"("administrador_objetivo" "uuid", "tipo_solicitado" "text", "serie_solicitada" "text", "siguiente_solicitado" bigint) RETURNS "public"."series_comprobante"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  serie_normalizada text := upper(trim(serie_solicitada));
  prefijo_esperado text := case tipo_solicitado when 'factura' then 'F' when 'boleta' then 'B' end;
  serie_activa public.series_comprobante%rowtype;
  serie_existente public.series_comprobante%rowtype;
  resultado public.series_comprobante%rowtype;
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = administrador_objetivo and p.rol = 'administrador' and p.activo
  ) then
    raise exception using errcode = '42501', message = 'Solo una cuenta administradora activa puede configurar la serie.';
  end if;
  if prefijo_esperado is null
    or serie_normalizada is null
    or serie_normalizada !~ ('^' || prefijo_esperado || '[A-Z0-9]{3}$')
    or siguiente_solicitado is null or siguiente_solicitado <= 0 then
    raise exception using errcode = '22023', message = 'La serie no corresponde al tipo y el correlativo debe ser positivo.';
  end if;

  lock table public.series_comprobante in exclusive mode;

  select * into serie_activa from public.series_comprobante
  where tipo = tipo_solicitado and activa for update;
  select * into serie_existente from public.series_comprobante
  where tipo = tipo_solicitado and serie = serie_normalizada for update;

  if found and siguiente_solicitado < serie_existente.siguiente_numero then
    raise exception using errcode = '22023', message = 'El correlativo no puede retroceder.';
  end if;

  if found and serie_existente.id = serie_activa.id then
    update public.series_comprobante
    set siguiente_numero = siguiente_solicitado,
        actualizado_por = administrador_objetivo,
        actualizado_en = now()
    where id = serie_existente.id
    returning * into resultado;
  else
    if serie_activa.id is not null then
      update public.series_comprobante
      set activa = false, actualizado_por = administrador_objetivo, actualizado_en = now()
      where id = serie_activa.id;
    end if;
    insert into public.series_comprobante (
      tipo, serie, siguiente_numero, activa, actualizado_por, actualizado_en
    ) values (
      tipo_solicitado, serie_normalizada, siguiente_solicitado, true, administrador_objetivo, now()
    )
    on conflict (tipo, serie) do update set
      siguiente_numero = excluded.siguiente_numero,
      activa = true,
      actualizado_por = excluded.actualizado_por,
      actualizado_en = excluded.actualizado_en
    returning * into resultado;
  end if;

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (
    administrador_objetivo,
    'configurar_serie_comprobante',
    'serie_comprobante',
    resultado.id,
    jsonb_build_object('tipo', resultado.tipo, 'serie', resultado.serie,
      'siguiente_numero', resultado.siguiente_numero)
  );
  return resultado;
end;
$_$;


ALTER FUNCTION "public"."configurar_serie_comprobante"("administrador_objetivo" "uuid", "tipo_solicitado" "text", "serie_solicitada" "text", "siguiente_solicitado" bigint) OWNER TO "postgres";

--
-- Name: configurar_serie_factura("uuid", "text", bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."configurar_serie_factura"("administrador_objetivo" "uuid", "serie_solicitada" "text", "siguiente_solicitado" bigint) RETURNS "public"."series_comprobante"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  serie_normalizada text := upper(trim(serie_solicitada));
  serie_activa public.series_comprobante%rowtype;
  serie_existente public.series_comprobante%rowtype;
  resultado public.series_comprobante%rowtype;
begin
  if not exists (
    select 1
    from public.perfiles p
    where p.id = administrador_objetivo
      and p.rol = 'administrador'
      and p.activo
  ) then
    raise exception using
      errcode = '42501',
      message = 'Solo una cuenta administradora activa puede configurar la serie.';
  end if;

  if serie_normalizada is null
    or serie_normalizada !~ '^F[A-Z0-9]{3}$'
    or siguiente_solicitado is null
    or siguiente_solicitado <= 0 then
    raise exception using
      errcode = '22023',
      message = 'La serie debe tener formato F001 y el siguiente número debe ser positivo.';
  end if;

  -- Serializa la configuración con otras reservas y cambios de serie.
  lock table public.series_comprobante in exclusive mode;

  select * into serie_activa
  from public.series_comprobante
  where tipo = 'factura' and activa
  for update;

  select * into serie_existente
  from public.series_comprobante
  where tipo = 'factura' and serie = serie_normalizada
  for update;

  if found and siguiente_solicitado < serie_existente.siguiente_numero then
    raise exception using
      errcode = '22023',
      message = 'El correlativo no puede retroceder.';
  end if;

  if found and serie_existente.id = serie_activa.id then
    update public.series_comprobante
    set siguiente_numero = siguiente_solicitado,
        actualizado_por = administrador_objetivo,
        actualizado_en = now()
    where id = serie_existente.id
    returning * into resultado;
  else
    if serie_activa.id is not null then
      update public.series_comprobante
      set activa = false,
          actualizado_por = administrador_objetivo,
          actualizado_en = now()
      where id = serie_activa.id;
    end if;

    insert into public.series_comprobante (
      tipo, serie, siguiente_numero, activa, actualizado_por, actualizado_en
    ) values (
      'factura', serie_normalizada, siguiente_solicitado, true,
      administrador_objetivo, now()
    )
    on conflict (tipo, serie) do update set
      siguiente_numero = excluded.siguiente_numero,
      activa = true,
      actualizado_por = excluded.actualizado_por,
      actualizado_en = excluded.actualizado_en
    returning * into resultado;
  end if;

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (
    administrador_objetivo,
    'configurar_serie_factura',
    'serie_comprobante',
    resultado.id,
    jsonb_build_object(
      'tipo', resultado.tipo,
      'serie', resultado.serie,
      'siguiente_numero', resultado.siguiente_numero
    )
  );

  return resultado;
end;
$_$;


ALTER FUNCTION "public"."configurar_serie_factura"("administrador_objetivo" "uuid", "serie_solicitada" "text", "siguiente_solicitado" bigint) OWNER TO "postgres";

--
-- Name: confirmar_venta("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."confirmar_venta"("venta_objetivo" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  venta_actual public.ventas%rowtype;
  empresa_config public.empresa%rowtype;
  producto_actual public.productos%rowtype;
  combinacion_actual public.combinaciones%rowtype;
  linea_actual record;
  grupo record;
  precio_actual numeric(12, 2);
  importe_actual numeric(12, 2);
  impuesto_actual numeric(12, 2);
  tasa_actual numeric(5, 2);
  cantidad_disponible numeric(12, 3);
  existencias_nuevas numeric(12, 3);
begin
  if not (select private.tiene_rol(array['administrador', 'vendedor'])) then
    raise exception using errcode = '42501', message = 'La sesión no puede confirmar ventas.';
  end if;
  select * into venta_actual from public.ventas
  where id = venta_objetivo
    and ((select private.tiene_rol(array['administrador'])) or creado_por = (select auth.uid()))
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró la venta.';
  end if;
  if venta_actual.estado = 'confirmada' then
    return jsonb_build_object('venta_id', venta_actual.id, 'estado', venta_actual.estado, 'total', venta_actual.total);
  end if;
  if venta_actual.estado <> 'borrador' then
    raise exception using errcode = '55000', message = 'La venta ya no está disponible para confirmar.';
  end if;
  if not exists (select 1 from public.lineas_venta where venta_id = venta_objetivo) then
    raise exception using errcode = '22023', message = 'La venta no tiene productos.';
  end if;

  select * into strict empresa_config from public.empresa limit 1;
  tasa_actual := case when empresa_config.igv_activo then empresa_config.igv_porcentaje / 100 else 0 end;
  for linea_actual in
    select * from public.lineas_venta
    where venta_id = venta_objetivo
    order by producto_id, combinacion_id nulls first, id
  loop
    select * into producto_actual from public.productos
    where id = linea_actual.producto_id and activo
    for update;
    if not found then
      raise exception using errcode = '55000', message = 'Un producto de la venta ya no está activo; actualice el borrador.';
    end if;
    if producto_actual.usa_combinaciones then
      select * into combinacion_actual from public.combinaciones
      where id = linea_actual.combinacion_id and producto_id = producto_actual.id and activa
      for update;
      if not found then
        raise exception using errcode = '55000', message = 'Una combinación de la venta ya no está activa; actualice el borrador.';
      end if;
      precio_actual := combinacion_actual.precio;
    elsif linea_actual.combinacion_id is null then
      precio_actual := producto_actual.precio;
    else
      raise exception using errcode = '55000', message = 'La combinación de un producto cambió; actualice el borrador.';
    end if;

    if precio_actual is distinct from linea_actual.precio_unitario then
      raise exception using errcode = '55000', message = 'El precio de un producto cambió; actualice el borrador antes de confirmar.';
    end if;
    importe_actual := round(precio_actual * linea_actual.cantidad, 2);
    if empresa_config.precios_incluyen_igv then
      impuesto_actual := case when tasa_actual > 0 then round(importe_actual * tasa_actual / (1 + tasa_actual), 2) else 0 end;
      if linea_actual.subtotal is distinct from importe_actual - impuesto_actual
        or linea_actual.igv is distinct from impuesto_actual
        or linea_actual.total is distinct from importe_actual then
        raise exception using errcode = '55000', message = 'La configuración de impuestos cambió; actualice el borrador antes de confirmar.';
      end if;
    else
      impuesto_actual := round(importe_actual * tasa_actual, 2);
      if linea_actual.subtotal is distinct from importe_actual
        or linea_actual.igv is distinct from impuesto_actual
        or linea_actual.total is distinct from importe_actual + impuesto_actual then
        raise exception using errcode = '55000', message = 'La configuración de impuestos cambió; actualice el borrador antes de confirmar.';
      end if;
    end if;
  end loop;

  for grupo in
    select producto_id, combinacion_id, sum(cantidad) as cantidad
    from public.lineas_venta where venta_id = venta_objetivo
    group by producto_id, combinacion_id
    order by producto_id, combinacion_id nulls first
  loop
    if grupo.combinacion_id is null then
      select existencias into cantidad_disponible
      from public.productos where id = grupo.producto_id and activo and not usa_combinaciones
      for update;
    else
      select existencias into cantidad_disponible
      from public.combinaciones where id = grupo.combinacion_id and producto_id = grupo.producto_id and activa
      for update;
    end if;
    if not found or cantidad_disponible < grupo.cantidad then
      raise exception using errcode = '23514', message = 'No hay existencias suficientes para confirmar la venta.';
    end if;
  end loop;

  for grupo in
    select producto_id, combinacion_id, sum(cantidad) as cantidad
    from public.lineas_venta where venta_id = venta_objetivo
    group by producto_id, combinacion_id
    order by producto_id, combinacion_id nulls first
  loop
    if grupo.combinacion_id is null then
      update public.productos set existencias = existencias - grupo.cantidad, actualizado_en = now()
      where id = grupo.producto_id returning existencias into existencias_nuevas;
    else
      update public.combinaciones set existencias = existencias - grupo.cantidad
      where id = grupo.combinacion_id returning existencias into existencias_nuevas;
    end if;
    insert into public.movimientos_inventario (
      producto_id, combinacion_id, tipo, cantidad,
      existencias_resultantes, motivo, venta_id, usuario_id
    ) values (
      grupo.producto_id, grupo.combinacion_id, 'venta', -grupo.cantidad,
      existencias_nuevas, 'Venta confirmada', venta_objetivo, (select auth.uid())
    );
  end loop;

  update public.ventas
  set estado = 'confirmada', confirmado_por = (select auth.uid()),
      confirmado_en = now(), actualizado_en = now()
  where id = venta_objetivo;
  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values ((select auth.uid()), 'confirmar_venta', 'venta', venta_objetivo,
    jsonb_build_object('total', venta_actual.total));
  return jsonb_build_object('venta_id', venta_objetivo, 'estado', 'confirmada', 'total', venta_actual.total);
end;
$$;


ALTER FUNCTION "public"."confirmar_venta"("venta_objetivo" "uuid") OWNER TO "postgres";

--
-- Name: confirmar_venta_con_comprobante("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."confirmar_venta_con_comprobante"("venta_objetivo" "uuid", "tipo_comprobante_solicitado" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  venta_actual public.ventas%rowtype;
  empresa_actual public.empresa%rowtype;
  resultado jsonb;
begin
  if not (select private.tiene_rol(array['administrador', 'vendedor'])) then
    raise exception using errcode = '42501', message = 'La sesión no puede confirmar ventas.';
  end if;
  if tipo_comprobante_solicitado not in ('factura', 'boleta') then
    raise exception using errcode = '22023', message = 'Selecciona factura o boleta.';
  end if;
  select * into venta_actual from public.ventas v
  where v.id = venta_objetivo
    and ((select private.tiene_rol(array['administrador'])) or v.creado_por = (select auth.uid()))
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'No se encontró la venta.';
  end if;
  if venta_actual.estado not in ('borrador', 'confirmada') then
    raise exception using errcode = '55000', message = 'La venta ya no está disponible para confirmar.';
  end if;
  if venta_actual.tipo_comprobante is not null
    and venta_actual.tipo_comprobante <> tipo_comprobante_solicitado then
    raise exception using errcode = '23505', message = 'La venta ya tiene asignado otro tipo de comprobante.';
  end if;
  if exists (
    select 1 from public.comprobantes c
    where c.venta_id = venta_objetivo and c.tipo <> tipo_comprobante_solicitado
  ) then
    raise exception using errcode = '23505', message = 'La venta ya tiene un comprobante de otro tipo.';
  end if;

  select * into strict empresa_actual from public.empresa limit 1;
  if empresa_actual.ruc is null or not private.ruc_valido(empresa_actual.ruc) then
    raise exception using errcode = '22023', message = 'Complete el RUC de la empresa antes de confirmar la venta.';
  end if;
  if not exists (
    select 1 from public.series_comprobante s
    where s.tipo = tipo_comprobante_solicitado and s.activa
  ) then
    raise exception using errcode = '22023', message = 'Configure una serie activa antes de confirmar la venta.';
  end if;
  if tipo_comprobante_solicitado = 'factura'
    and (venta_actual.cliente_tipo_documento <> 'ruc'
      or not private.ruc_valido(venta_actual.cliente_numero_documento)) then
    raise exception using errcode = '22023', message = 'La factura requiere un cliente identificado con RUC.';
  end if;
  if tipo_comprobante_solicitado = 'boleta' and venta_actual.total > 700
    and nullif(venta_actual.cliente_numero_documento, '') is null then
    raise exception using errcode = '22023', message = 'Las boletas mayores a S/ 700 requieren identificar al cliente.';
  end if;

  if venta_actual.estado = 'borrador' then
    select public.confirmar_venta(venta_objetivo) into resultado;
  else
    resultado := jsonb_build_object(
      'venta_id', venta_actual.id, 'estado', venta_actual.estado, 'total', venta_actual.total
    );
  end if;
  update public.ventas
  set tipo_comprobante = tipo_comprobante_solicitado, actualizado_en = now()
  where id = venta_objetivo;
  return resultado || jsonb_build_object('tipo_comprobante', tipo_comprobante_solicitado);
end;
$$;


ALTER FUNCTION "public"."confirmar_venta_con_comprobante"("venta_objetivo" "uuid", "tipo_comprobante_solicitado" "text") OWNER TO "postgres";

--
-- Name: crear_borrador_venta("uuid", "jsonb", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."crear_borrador_venta"("cliente_objetivo" "uuid", "lineas" "jsonb", "venta_objetivo" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  usuario_actual uuid := (select auth.uid());
  id_venta uuid := venta_objetivo;
  venta_estado text;
  nombre_cliente text;
  tipo_doc_cliente text;
  numero_doc_cliente text;
  direccion_cliente text;
  empresa_config public.empresa%rowtype;
  linea jsonb;
  producto public.productos%rowtype;
  combinacion public.combinaciones%rowtype;
  id_producto uuid;
  id_combinacion uuid;
  cantidad_linea numeric(12, 3);
  precio numeric(12, 2);
  importe numeric(12, 2);
  subtotal_lineas numeric(12, 2) := 0;
  igv_calculado numeric(12, 2);
  total_calculado numeric(12, 2);
  tasa numeric(5, 2);
  incluye_igv boolean;
  descripcion text;
  sku text;
begin
  if not (select private.tiene_rol(array['administrador', 'vendedor'])) then
    raise exception using errcode = '42501', message = 'La sesión no puede crear ventas.';
  end if;
  if jsonb_typeof(lineas) <> 'array' or jsonb_array_length(lineas) = 0 then
    raise exception using errcode = '22023', message = 'Agregue al menos un producto a la venta.';
  end if;

  if cliente_objetivo is not null then
    select nombre, tipo_documento, numero_documento, direccion
      into nombre_cliente, tipo_doc_cliente, numero_doc_cliente, direccion_cliente
    from public.clientes where id = cliente_objetivo and activo;
    if not found then
      raise exception using errcode = 'P0002', message = 'No se encontró el cliente activo.';
    end if;
  end if;
  select * into strict empresa_config from public.empresa limit 1;
  tasa := case when empresa_config.igv_activo then empresa_config.igv_porcentaje / 100 else 0 end;
  incluye_igv := empresa_config.precios_incluyen_igv;

  if id_venta is not null then
    select estado into venta_estado
    from public.ventas
    where id = id_venta
      and ((select private.tiene_rol(array['administrador'])) or creado_por = usuario_actual)
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'No se encontró la venta.';
    end if;
    if venta_estado <> 'borrador' then
      raise exception using errcode = '55000', message = 'Solo se puede editar un borrador.';
    end if;
    update public.ventas set cliente_id = cliente_objetivo,
      cliente_nombre = nombre_cliente, cliente_tipo_documento = tipo_doc_cliente,
      cliente_numero_documento = numero_doc_cliente, cliente_direccion = direccion_cliente,
      actualizado_en = now()
    where id = id_venta;
    delete from public.lineas_venta lv where lv.venta_id = id_venta;
  else
    insert into public.ventas (
      cliente_id, cliente_nombre, cliente_tipo_documento,
      cliente_numero_documento, cliente_direccion, creado_por, moneda
    ) values (
      cliente_objetivo, nombre_cliente, tipo_doc_cliente,
      numero_doc_cliente, direccion_cliente, usuario_actual, empresa_config.moneda
    ) returning id into id_venta;
  end if;

  for linea in select value from jsonb_array_elements(lineas) loop
    id_producto := (linea ->> 'producto_id')::uuid;
    id_combinacion := nullif(linea ->> 'combinacion_id', '')::uuid;
    cantidad_linea := (linea ->> 'cantidad')::numeric;
    if cantidad_linea is null or cantidad_linea <= 0 then
      raise exception using errcode = '22023', message = 'Las cantidades deben ser mayores que cero.';
    end if;

    select * into producto from public.productos
    where id = id_producto and activo;
    if not found then
      raise exception using errcode = 'P0002', message = 'El producto no existe o está inactivo.';
    end if;

    if producto.usa_combinaciones then
      if id_combinacion is null then
        raise exception using errcode = '22023', message = 'Seleccione la combinación del producto.';
      end if;
      select * into combinacion from public.combinaciones
      where id = id_combinacion and producto_id = id_producto and activa;
      if not found then
        raise exception using errcode = 'P0002', message = 'La combinación no existe o está inactiva.';
      end if;
      precio := combinacion.precio;
      sku := combinacion.sku;
      descripcion := producto.nombre || ' ' || coalesce((
        select string_agg(vo.valor, ' ' order by op.posicion)
        from public.valores_opcion vo
        join public.opciones_producto op on op.id = vo.opcion_id
        where vo.id in (combinacion.valor_opcion_1_id, combinacion.valor_opcion_2_id)
      ), '');
    else
      if id_combinacion is not null or producto.precio is null then
        raise exception using errcode = '22023', message = 'La combinación no corresponde al producto.';
      end if;
      precio := producto.precio;
      sku := producto.sku;
      descripcion := producto.nombre;
    end if;

    importe := round(precio * cantidad_linea, 2);
    subtotal_lineas := subtotal_lineas + importe;
    insert into public.lineas_venta (
      venta_id, producto_id, combinacion_id, descripcion_congelada,
      sku_congelado, unidad_medida, cantidad, precio_unitario,
      subtotal, igv, total
    ) values (
      id_venta, id_producto, id_combinacion, trim(descripcion), sku,
      producto.unidad_medida, cantidad_linea, precio, importe, 0, importe
    );
  end loop;

  if incluye_igv and tasa > 0 then
    total_calculado := round(subtotal_lineas, 2);
    igv_calculado := total_calculado - round(total_calculado / (1 + tasa), 2);
    subtotal_lineas := total_calculado - igv_calculado;
  else
    igv_calculado := round(subtotal_lineas * tasa, 2);
    total_calculado := subtotal_lineas + igv_calculado;
  end if;

  update public.ventas
  set subtotal = subtotal_lineas, igv = igv_calculado, total = total_calculado,
      actualizado_en = now()
  where id = id_venta;
  update public.lineas_venta lv
  set igv = case when incluye_igv and tasa > 0
    then round(total * tasa / (1 + tasa), 2)
    else round(total * tasa, 2) end,
      subtotal = case when incluye_igv and tasa > 0
        then total - round(total * tasa / (1 + tasa), 2)
        else total end,
      total = case when incluye_igv then total else total + round(total * tasa, 2) end
  where lv.venta_id = id_venta;
  return id_venta;
end;
$$;


ALTER FUNCTION "public"."crear_borrador_venta"("cliente_objetivo" "uuid", "lineas" "jsonb", "venta_objetivo" "uuid") OWNER TO "postgres";

--
-- Name: crear_borrador_venta_con_comprobante("uuid", "jsonb", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."crear_borrador_venta_con_comprobante"("cliente_objetivo" "uuid", "lineas" "jsonb", "tipo_comprobante_solicitado" "text", "venta_objetivo" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  venta_id uuid;
  venta_actual public.ventas%rowtype;
begin
  if tipo_comprobante_solicitado not in ('factura', 'boleta') then
    raise exception using errcode = '22023', message = 'Selecciona factura o boleta.';
  end if;

  venta_id := public.crear_borrador_venta(
    cliente_objetivo,
    lineas,
    venta_objetivo
  );

  select * into strict venta_actual
  from public.ventas v
  where v.id = venta_id
    and v.estado = 'borrador';

  if tipo_comprobante_solicitado = 'factura'
    and (
      venta_actual.cliente_tipo_documento <> 'ruc'
      or not private.ruc_valido(venta_actual.cliente_numero_documento)
    ) then
    raise exception using errcode = '22023', message = 'La factura requiere un cliente identificado con RUC válido.';
  end if;

  if tipo_comprobante_solicitado = 'boleta'
    and venta_actual.total > 700
    and nullif(venta_actual.cliente_numero_documento, '') is null then
    raise exception using errcode = '22023', message = 'Las boletas mayores a S/ 700 requieren identificar al cliente.';
  end if;

  update public.ventas
  set tipo_comprobante = tipo_comprobante_solicitado,
      actualizado_en = now()
  where id = venta_id;

  return venta_id;
end;
$$;


ALTER FUNCTION "public"."crear_borrador_venta_con_comprobante"("cliente_objetivo" "uuid", "lineas" "jsonb", "tipo_comprobante_solicitado" "text", "venta_objetivo" "uuid") OWNER TO "postgres";

--
-- Name: crear_producto_con_combinaciones("text", "text", "uuid", "text", numeric, numeric, "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."crear_producto_con_combinaciones"("sku_producto" "text", "nombre_producto" "text", "categoria_objetivo" "uuid", "unidad" "text", "precio_base" numeric, "minimo_stock" numeric, "opciones" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  producto_id uuid;
  opcion_id uuid;
  valores_opcion_1_ids uuid[] := array[]::uuid[];
  valores_opcion_2_ids uuid[] := array[]::uuid[];
  valores_actuales uuid[];
  valor_opcion_id uuid;
  combinacion_sku text;
  cantidad_opciones integer;
  valores jsonb;
  nombre_opcion text;
  numero_combinacion integer := 0;
begin
  if not (select private.tiene_rol(array['administrador', 'vendedor'])) then
    raise exception using errcode = '42501', message = 'La sesión no puede crear productos.';
  end if;
  if nullif(trim(sku_producto), '') is null
    or nullif(trim(nombre_producto), '') is null
    or nullif(trim(unidad), '') is null
    or precio_base is null or precio_base < 0
    or minimo_stock is null or minimo_stock < 0
    or jsonb_typeof(opciones) is distinct from 'array'
  then
    raise exception using errcode = '22023', message = 'Revisa los datos del producto y sus opciones.';
  end if;

  cantidad_opciones := jsonb_array_length(opciones);
  if cantidad_opciones not between 1 and 2 then
    raise exception using errcode = '22023', message = 'Un producto requiere una o dos opciones.';
  end if;
  if categoria_objetivo is not null and not exists (
    select 1 from public.categorias where id = categoria_objetivo and activa
  ) then
    raise exception using errcode = '22023', message = 'La categoría no existe o está inactiva.';
  end if;

  for indice_opcion in 1..cantidad_opciones loop
    nombre_opcion := nullif(trim(opciones -> (indice_opcion - 1) ->> 'nombre'), '');
    valores := opciones -> (indice_opcion - 1) -> 'valores';
    if nombre_opcion is null or jsonb_typeof(valores) is distinct from 'array'
      or jsonb_array_length(valores) not between 1 and 20
    then
      raise exception using errcode = '22023', message = 'Cada opción necesita un nombre y entre uno y veinte valores.';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(valores) as elemento(valor)
      where nullif(trim(elemento.valor), '') is null
    ) or (select count(distinct lower(trim(elemento.valor))) from jsonb_array_elements_text(valores) as elemento(valor)) <> jsonb_array_length(valores) then
      raise exception using errcode = '22023', message = 'Los valores de una opción deben estar completos y no repetirse.';
    end if;
  end loop;

  if cantidad_opciones = 2 and lower(trim(opciones -> 0 ->> 'nombre')) = lower(trim(opciones -> 1 ->> 'nombre')) then
    raise exception using errcode = '22023', message = 'Las opciones deben tener nombres distintos.';
  end if;

  insert into public.productos (categoria_id, sku, nombre, unidad_medida, usa_combinaciones, precio, stock_minimo, creado_por)
  values (categoria_objetivo, trim(sku_producto), trim(nombre_producto), upper(trim(unidad)), true, null, minimo_stock, (select auth.uid()))
  returning id into producto_id;

  for indice_opcion in 1..cantidad_opciones loop
    nombre_opcion := trim(opciones -> (indice_opcion - 1) ->> 'nombre');
    valores := opciones -> (indice_opcion - 1) -> 'valores';
    insert into public.opciones_producto (producto_id, nombre, posicion)
    values (producto_id, nombre_opcion, indice_opcion)
    returning id into opcion_id;
    valores_actuales := array[]::uuid[];
    for indice_valor in 0..jsonb_array_length(valores) - 1 loop
      insert into public.valores_opcion (producto_id, opcion_id, valor)
      values (producto_id, opcion_id, trim(valores ->> indice_valor))
      returning id into valor_opcion_id;
      valores_actuales := array_append(valores_actuales, valor_opcion_id);
    end loop;
    if indice_opcion = 1 then
      valores_opcion_1_ids := valores_actuales;
    else
      valores_opcion_2_ids := valores_actuales;
    end if;
  end loop;

  if cantidad_opciones = 1 then
    for indice_valor in 1..coalesce(array_length(valores_opcion_1_ids, 1), 0) loop
      numero_combinacion := numero_combinacion + 1;
      combinacion_sku := trim(sku_producto) || '-' || lpad(indice_valor::text, 2, '0');
      insert into public.combinaciones (producto_id, valor_opcion_1_id, sku, precio, stock_minimo)
      values (producto_id, valores_opcion_1_ids[indice_valor], combinacion_sku, precio_base, minimo_stock);
    end loop;
  else
    for indice_valor in 1..coalesce(array_length(valores_opcion_1_ids, 1), 0) loop
      for indice_segundo in 1..coalesce(array_length(valores_opcion_2_ids, 1), 0) loop
        numero_combinacion := numero_combinacion + 1;
        combinacion_sku := trim(sku_producto) || '-' || lpad(numero_combinacion::text, 2, '0');
        insert into public.combinaciones (producto_id, valor_opcion_1_id, valor_opcion_2_id, sku, precio, stock_minimo)
        values (producto_id, valores_opcion_1_ids[indice_valor], valores_opcion_2_ids[indice_segundo], combinacion_sku, precio_base, minimo_stock);
      end loop;
    end loop;
  end if;
  return producto_id;
end;
$$;


ALTER FUNCTION "public"."crear_producto_con_combinaciones"("sku_producto" "text", "nombre_producto" "text", "categoria_objetivo" "uuid", "unidad" "text", "precio_base" numeric, "minimo_stock" numeric, "opciones" "jsonb") OWNER TO "postgres";

--
-- Name: descartar_borrador_venta("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."descartar_borrador_venta"("venta_objetivo" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not (select private.tiene_rol(array['administrador', 'vendedor'])) then
    raise exception using errcode = '42501', message = 'La sesión no puede descartar ventas.';
  end if;
  update public.ventas
  set estado = 'descartada', actualizado_en = now()
  where id = venta_objetivo and estado = 'borrador'
    and ((select private.tiene_rol(array['administrador'])) or creado_por = (select auth.uid()));
  if not found then
    raise exception using errcode = '55000', message = 'Solo se puede descartar un borrador propio.';
  end if;
end;
$$;


ALTER FUNCTION "public"."descartar_borrador_venta"("venta_objetivo" "uuid") OWNER TO "postgres";

--
-- Name: empresa; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."empresa" (
    "unica" boolean DEFAULT true NOT NULL,
    "nombre" "text" NOT NULL,
    "ruc" "text",
    "direccion" "text",
    "telefono" "text",
    "correo" "text",
    "moneda" "text" DEFAULT 'PEN'::"text" NOT NULL,
    "igv_activo" boolean DEFAULT true NOT NULL,
    "igv_porcentaje" numeric(5,2) DEFAULT 18 NOT NULL,
    "precios_incluyen_igv" boolean DEFAULT true NOT NULL,
    "actualizado_por" "uuid",
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "empresa_igv_porcentaje_check" CHECK ((("igv_porcentaje" >= (0)::numeric) AND ("igv_porcentaje" <= (100)::numeric))),
    CONSTRAINT "empresa_moneda_check" CHECK (("moneda" = ANY (ARRAY['PEN'::"text", 'USD'::"text"]))),
    CONSTRAINT "empresa_nombre_check" CHECK (("length"(TRIM(BOTH FROM "nombre")) > 0)),
    CONSTRAINT "empresa_ruc_check" CHECK ((("ruc" IS NULL) OR ("ruc" ~ '^[0-9]{11}$'::"text"))),
    CONSTRAINT "empresa_unica_check" CHECK ("unica")
);


ALTER TABLE "public"."empresa" OWNER TO "postgres";

--
-- Name: guardar_empresa("text", "text", "text", "text", "text", "text", boolean, numeric, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."guardar_empresa"("nombre_empresa" "text", "ruc_empresa" "text", "direccion_empresa" "text", "telefono_empresa" "text", "correo_empresa" "text", "moneda_empresa" "text", "igv_habilitado" boolean, "tasa_igv" numeric, "precios_con_igv" boolean) RETURNS "public"."empresa"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  resultado public.empresa%rowtype;
begin
  if not (select private.tiene_rol(array['administrador'])) then
    raise exception using errcode = '42501', message = 'Solo administración puede configurar la empresa.';
  end if;
  if nullif(trim(nombre_empresa), '') is null
    or (ruc_empresa is not null and not private.ruc_valido(ruc_empresa))
    or moneda_empresa not in ('PEN', 'USD')
    or tasa_igv < 0 or tasa_igv > 100 then
    raise exception using errcode = '22023', message = 'Revisa el nombre, RUC, moneda y tasa de IGV.';
  end if;

  insert into public.empresa (
    unica, nombre, ruc, direccion, telefono, correo, moneda,
    igv_activo, igv_porcentaje, precios_incluyen_igv, actualizado_por, actualizado_en
  ) values (
    true, trim(nombre_empresa), nullif(trim(ruc_empresa), ''),
    nullif(trim(direccion_empresa), ''), nullif(trim(telefono_empresa), ''),
    nullif(lower(trim(correo_empresa)), ''), moneda_empresa,
    igv_habilitado, tasa_igv, precios_con_igv, (select auth.uid()), now()
  )
  on conflict (unica) do update set
    nombre = excluded.nombre,
    ruc = excluded.ruc,
    direccion = excluded.direccion,
    telefono = excluded.telefono,
    correo = excluded.correo,
    moneda = excluded.moneda,
    igv_activo = excluded.igv_activo,
    igv_porcentaje = excluded.igv_porcentaje,
    precios_incluyen_igv = excluded.precios_incluyen_igv,
    actualizado_por = excluded.actualizado_por,
    actualizado_en = now()
  returning * into resultado;

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values ((select auth.uid()), 'guardar_empresa', 'empresa', null,
    jsonb_build_object('nombre', resultado.nombre, 'ruc_actualizado', resultado.ruc is not null));
  return resultado;
end;
$$;


ALTER FUNCTION "public"."guardar_empresa"("nombre_empresa" "text", "ruc_empresa" "text", "direccion_empresa" "text", "telefono_empresa" "text", "correo_empresa" "text", "moneda_empresa" "text", "igv_habilitado" boolean, "tasa_igv" numeric, "precios_con_igv" boolean) OWNER TO "postgres";

--
-- Name: inicializar_administrador("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."inicializar_administrador"("usuario_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Solo el aprovisionamiento inicial puede asignar el primer administrador.';
  end if;

  if exists (select 1 from public.perfiles where rol = 'administrador') then
    raise exception using errcode = '23505', message = 'Ya existe un administrador inicial.';
  end if;

  update public.perfiles
  set rol = 'administrador', actualizado_en = now()
  where id = usuario_id and activo;

  if not found then
    raise exception using errcode = 'P0002', message = 'No existe un usuario activo para aprovisionar.';
  end if;
end;
$$;


ALTER FUNCTION "public"."inicializar_administrador"("usuario_id" "uuid") OWNER TO "postgres";

--
-- Name: registrar_consulta_boleta("uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."registrar_consulta_boleta"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid", "respuesta" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = administrador_objetivo and p.rol = 'administrador' and p.activo
  ) then
    raise exception using errcode = '42501', message = 'La cuenta administradora no está activa.';
  end if;

  update public.comprobantes
  set respuesta_consulta_sunat = respuesta,
      respuesta_proveedor = coalesce(respuesta, respuesta_proveedor),
      enlace_pdf = coalesce(nullif(respuesta ->> 'enlace_del_pdf', ''), enlace_pdf),
      enlace_xml = coalesce(nullif(respuesta ->> 'enlace_del_xml', ''), enlace_xml),
      enlace_cdr = coalesce(nullif(respuesta ->> 'enlace_del_cdr', ''), enlace_cdr),
      cadena_qr = coalesce(nullif(respuesta ->> 'cadena_para_codigo_qr', ''), cadena_qr),
      consultado_sunat_en = now(),
      consulta_en_proceso_hasta = null,
      actualizado_en = now()
  where id = comprobante_objetivo and tipo = 'boleta' and estado = 'emitido'
    and consulta_en_proceso_hasta > now();
  if not found then
    raise exception using errcode = 'P0002', message = 'La consulta de la boleta ya no está reservada.';
  end if;

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (
    administrador_objetivo, 'registrar_consulta_boleta', 'comprobante', comprobante_objetivo,
    jsonb_build_object(
      'encontrada', respuesta is not null,
      'aceptada_por_sunat', coalesce(respuesta ->> 'aceptada_por_sunat' = 'true', false)
    )
  );
end;
$$;


ALTER FUNCTION "public"."registrar_consulta_boleta"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid", "respuesta" "jsonb") OWNER TO "postgres";

--
-- Name: registrar_resultado_comprobante("uuid", "uuid", "text", "jsonb", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."registrar_resultado_comprobante"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid", "estado_resultado" "text", "respuesta" "jsonb", "error_mostrable" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  tipo_comprobante text;
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = administrador_objetivo and p.rol in ('administrador', 'vendedor') and p.activo
  ) then
    raise exception using errcode = '42501', message = 'La cuenta administradora no está activa.';
  end if;
  if estado_resultado not in ('emitido', 'rechazado', 'error') then
    raise exception using errcode = '22023', message = 'Estado de emisión no válido.';
  end if;

  select c.tipo into tipo_comprobante from public.comprobantes c
  join public.ventas v on v.id = c.venta_id
  where c.id = comprobante_objetivo and c.estado = 'emitiendo'
    and (
      exists (select 1 from public.perfiles p where p.id = administrador_objetivo and p.rol = 'administrador' and p.activo)
      or v.creado_por = administrador_objetivo
    )
  for update of c;
  if not found then
    raise exception using errcode = 'P0002', message = 'El comprobante no está en proceso.';
  end if;

  update public.comprobantes
  set estado = estado_resultado,
      respuesta_proveedor = coalesce(respuesta, '{}'::jsonb),
      enlace_pdf = coalesce(nullif(respuesta ->> 'enlace_del_pdf', ''), enlace_pdf),
      enlace_xml = coalesce(nullif(respuesta ->> 'enlace_del_xml', ''), enlace_xml),
      enlace_cdr = coalesce(nullif(respuesta ->> 'enlace_del_cdr', ''), enlace_cdr),
      cadena_qr = coalesce(nullif(respuesta ->> 'cadena_para_codigo_qr', ''), cadena_qr),
      error_publico = error_mostrable,
      procesando_hasta = null,
      consulta_sunat_desde = case
        when tipo_comprobante = 'boleta' and estado_resultado = 'emitido'
          then now() + interval '7 days'
        else null
      end,
      consultado_sunat_en = null,
      consulta_en_proceso_hasta = null,
      actualizado_en = now()
  where id = comprobante_objetivo;

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (administrador_objetivo, 'registrar_resultado_comprobante', 'comprobante', comprobante_objetivo,
    jsonb_build_object('estado', estado_resultado));
end;
$$;


ALTER FUNCTION "public"."registrar_resultado_comprobante"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid", "estado_resultado" "text", "respuesta" "jsonb", "error_mostrable" "text") OWNER TO "postgres";

--
-- Name: reporte_ventas(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reporte_ventas"("desde" timestamp with time zone, "hasta" timestamp with time zone) RETURNS TABLE("descripcion" "text", "moneda" "text", "ventas" bigint, "unidades" numeric, "total" numeric)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select l.descripcion_congelada,
    v.moneda,
    count(distinct v.id),
    sum(l.cantidad),
    sum(l.total)
  from public.lineas_venta l
  join public.ventas v on v.id = l.venta_id
  where v.estado = 'confirmada'
    and v.confirmado_en >= desde and v.confirmado_en < hasta
  group by l.descripcion_congelada, v.moneda
  order by v.moneda, sum(l.total) desc, l.descripcion_congelada;
$$;


ALTER FUNCTION "public"."reporte_ventas"("desde" timestamp with time zone, "hasta" timestamp with time zone) OWNER TO "postgres";

--
-- Name: reservar_comprobante("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reservar_comprobante"("administrador_objetivo" "uuid", "venta_objetivo" "uuid", "tipo_solicitado" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  venta_actual public.ventas%rowtype;
  config_empresa public.empresa%rowtype;
  serie_actual public.series_comprobante%rowtype;
  comprobante_actual public.comprobantes%rowtype;
  nuevo_id uuid;
  nuevo_numero bigint;
  payload_fiscal jsonb;
  mapa_documento text;
  subtotal_lineas numeric(12, 2);
  igv_lineas numeric(12, 2);
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = administrador_objetivo
      and p.rol in ('administrador', 'vendedor') and p.activo
  ) then
    raise exception using errcode = '42501', message = 'La cuenta no tiene acceso activo para emitir comprobantes.';
  end if;
  if tipo_solicitado not in ('boleta', 'factura') then
    raise exception using errcode = '22023', message = 'Tipo de comprobante no válido.';
  end if;

  select * into venta_actual from public.ventas v
  where v.id = venta_objetivo and v.estado = 'confirmada'
    and (
      exists (select 1 from public.perfiles p where p.id = administrador_objetivo and p.rol = 'administrador' and p.activo)
      or v.creado_por = administrador_objetivo
    )
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Solo se puede emitir el comprobante de una venta propia confirmada.';
  end if;
  if venta_actual.tipo_comprobante is distinct from tipo_solicitado then
    raise exception using errcode = '22023', message = 'El tipo seleccionado no coincide con el comprobante elegido al confirmar la venta.';
  end if;

  select * into config_empresa from public.empresa limit 1;
  if config_empresa.ruc is null or not private.ruc_valido(config_empresa.ruc) then
    raise exception using errcode = '22023', message = 'Complete el RUC de la empresa antes de emitir.';
  end if;
  if tipo_solicitado = 'factura' and (venta_actual.cliente_tipo_documento <> 'ruc' or not private.ruc_valido(venta_actual.cliente_numero_documento)) then
    raise exception using errcode = '22023', message = 'La factura requiere un cliente identificado con RUC.';
  end if;
  if tipo_solicitado = 'boleta' and venta_actual.total > 700 and nullif(venta_actual.cliente_numero_documento, '') is null then
    raise exception using errcode = '22023', message = 'Las boletas mayores a S/ 700 requieren identificar al cliente.';
  end if;

  select * into comprobante_actual from public.comprobantes
  where venta_id = venta_objetivo
  for update;
  if found then
    if comprobante_actual.tipo <> tipo_solicitado then
      raise exception using errcode = '23505', message = 'La venta ya tiene un comprobante de otro tipo.';
    end if;
    if comprobante_actual.estado = 'emitido' or comprobante_actual.estado = 'rechazado' then
      return jsonb_build_object(
        'comprobante_id', comprobante_actual.id, 'estado', comprobante_actual.estado,
        'puede_emitir', false, 'reconciliar', false, 'payload', comprobante_actual.payload
      );
    end if;
    if comprobante_actual.estado = 'emitiendo' and comprobante_actual.procesando_hasta > now() then
      return jsonb_build_object(
        'comprobante_id', comprobante_actual.id, 'estado', comprobante_actual.estado,
        'puede_emitir', false, 'reconciliar', false, 'payload', comprobante_actual.payload
      );
    end if;
    update public.comprobantes
    set estado = 'emitiendo', procesando_hasta = now() + interval '2 minutes',
        intentos = intentos + 1, error_publico = null, actualizado_en = now()
    where id = comprobante_actual.id;
    return jsonb_build_object(
      'comprobante_id', comprobante_actual.id, 'estado', 'emitiendo',
      'puede_emitir', true, 'reconciliar', comprobante_actual.intentos > 0,
      'serie', comprobante_actual.serie, 'numero', comprobante_actual.numero,
      'payload', comprobante_actual.payload
    );
  end if;

  select * into serie_actual from public.series_comprobante
  where tipo = tipo_solicitado and activa
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Configure una serie activa antes de emitir.';
  end if;
  nuevo_numero := serie_actual.siguiente_numero;
  update public.series_comprobante
  set siguiente_numero = siguiente_numero + 1, actualizado_en = now()
  where id = serie_actual.id;
  nuevo_id := extensions.gen_random_uuid();
  mapa_documento := case venta_actual.cliente_tipo_documento
    when 'dni' then '1' when 'ce' then '4' when 'ruc' then '6'
    when 'pasaporte' then '7' else '0' end;

  select coalesce(sum(l.subtotal), 0), coalesce(sum(l.igv), 0)
  into subtotal_lineas, igv_lineas
  from public.lineas_venta l where l.venta_id = venta_objetivo;
  if round(subtotal_lineas + igv_lineas, 2) <> venta_actual.total then
    raise exception using errcode = '23514', message = 'Las líneas de venta no cuadran con el total; no se emitió el comprobante.';
  end if;

  select jsonb_build_object(
    'operacion', 'generar_comprobante',
    'tipo_de_comprobante', case tipo_solicitado when 'factura' then 1 else 2 end,
    'serie', serie_actual.serie,
    'numero', nuevo_numero,
    'sunat_transaction', 1,
    'cliente_tipo_de_documento', mapa_documento,
    'cliente_numero_de_documento', coalesce(nullif(venta_actual.cliente_numero_documento, ''), '00000000'),
    'cliente_denominacion', coalesce(nullif(venta_actual.cliente_nombre, ''), 'CLIENTE VARIOS'),
    'cliente_direccion', coalesce(venta_actual.cliente_direccion, ''),
    'cliente_email', '',
    'fecha_de_emision', to_char(venta_actual.confirmado_en at time zone 'America/Lima', 'DD-MM-YYYY'),
    'moneda', case venta_actual.moneda when 'PEN' then 1 else 2 end,
    'tipo_de_cambio', '',
    'porcentaje_de_igv', case when config_empresa.igv_activo then config_empresa.igv_porcentaje else 0 end,
    'total_gravada', subtotal_lineas,
    'total_igv', igv_lineas,
    'total', venta_actual.total,
    'enviar_automaticamente_a_la_sunat', true,
    'enviar_automaticamente_al_cliente', false,
    'codigo_unico', nuevo_id::text,
    'formato_de_pdf', '',
    'items', (
      select jsonb_agg(jsonb_build_object(
        'unidad_de_medida', l.unidad_medida,
        'codigo', l.sku_congelado,
        'descripcion', l.descripcion_congelada,
        'cantidad', l.cantidad,
        'valor_unitario', case when config_empresa.precios_incluyen_igv
          then round(l.subtotal / l.cantidad, 4)
          else l.precio_unitario end,
        'precio_unitario', case when config_empresa.precios_incluyen_igv
          then l.precio_unitario
          else round(l.total / l.cantidad, 4) end,
        'subtotal', l.subtotal,
        'tipo_de_igv', case when config_empresa.igv_activo then 1 else 9 end,
        'igv', l.igv,
        'total', l.total
      ) order by l.creado_en, l.id)
      from public.lineas_venta l where l.venta_id = venta_objetivo
    )
  ) into payload_fiscal;

  insert into public.comprobantes (
    id, venta_id, tipo, serie, numero, estado, payload, solicitado_por,
    intentos, procesando_hasta
  ) values (
    nuevo_id, venta_objetivo, tipo_solicitado, serie_actual.serie,
    nuevo_numero, 'emitiendo', payload_fiscal, administrador_objetivo,
    1, now() + interval '2 minutes'
  );

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (administrador_objetivo, 'reservar_comprobante', 'venta', venta_objetivo,
    jsonb_build_object('tipo', tipo_solicitado, 'serie', serie_actual.serie, 'numero', nuevo_numero));

  return jsonb_build_object(
    'comprobante_id', nuevo_id, 'estado', 'emitiendo', 'puede_emitir', true,
    'reconciliar', false, 'serie', serie_actual.serie, 'numero', nuevo_numero,
    'payload', payload_fiscal
  );
end;
$$;


ALTER FUNCTION "public"."reservar_comprobante"("administrador_objetivo" "uuid", "venta_objetivo" "uuid", "tipo_solicitado" "text") OWNER TO "postgres";

--
-- Name: reservar_consulta_boleta("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reservar_consulta_boleta"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  comprobante_actual public.comprobantes%rowtype;
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = administrador_objetivo and p.rol = 'administrador' and p.activo
  ) then
    raise exception using errcode = '42501', message = 'La cuenta administradora no está activa.';
  end if;

  select * into comprobante_actual from public.comprobantes
  where id = comprobante_objetivo for update;
  if not found or comprobante_actual.tipo <> 'boleta' or comprobante_actual.estado <> 'emitido' then
    raise exception using errcode = '22023', message = 'Solo se consulta una boleta ya emitida.';
  end if;
  if comprobante_actual.consulta_sunat_desde is null
    or comprobante_actual.consulta_sunat_desde > now() then
    raise exception using errcode = '22023', message = 'La consulta de aceptación estará disponible después de siete días.';
  end if;
  if comprobante_actual.consultado_sunat_en > now() - interval '24 hours' then
    raise exception using errcode = '22023', message = 'La boleta ya se consultó hoy. Inténtalo mañana si sigue pendiente.';
  end if;
  if comprobante_actual.consulta_en_proceso_hasta > now() then
    raise exception using errcode = '55P03', message = 'Ya hay una consulta en proceso para esta boleta.';
  end if;

  update public.comprobantes
  set consulta_en_proceso_hasta = now() + interval '2 minutes'
  where id = comprobante_objetivo;
  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (administrador_objetivo, 'reservar_consulta_boleta', 'comprobante', comprobante_objetivo, '{}'::jsonb);

  return jsonb_build_object(
    'comprobante_id', comprobante_actual.id,
    'serie', comprobante_actual.serie,
    'numero', comprobante_actual.numero,
    'payload', comprobante_actual.payload
  );
end;
$$;


ALTER FUNCTION "public"."reservar_consulta_boleta"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid") OWNER TO "postgres";

--
-- Name: resumen_inicio(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."resumen_inicio"("desde" timestamp with time zone, "hasta" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with ventas_periodo as (
    select v.total, v.moneda
    from public.ventas v
    where v.estado = 'confirmada'
      and v.confirmado_en >= desde and v.confirmado_en < hasta
  ),
  totales as (
    select moneda, sum(total) as total
    from ventas_periodo
    group by moneda
  )
  select jsonb_build_object(
    'ventas', (select count(*) from ventas_periodo),
    'total_ventas', case
      when (select count(*) from totales) <= 1
        then coalesce((select sum(total) from totales), 0)
      else null
    end,
    'totales_por_moneda', coalesce(
      (select jsonb_object_agg(moneda, total) from totales),
      '{}'::jsonb
    ),
    'moneda_base', (select e.moneda from public.empresa e where e.unica),
    'stock_bajo', (
      select count(*) from public.productos p
      where p.activo and (
        (not p.usa_combinaciones and p.existencias <= p.stock_minimo)
        or (p.usa_combinaciones and exists (
          select 1 from public.combinaciones c
          where c.producto_id = p.id and c.activa and c.existencias <= c.stock_minimo
        ))
      )
    )
  );
$$;


ALTER FUNCTION "public"."resumen_inicio"("desde" timestamp with time zone, "hasta" timestamp with time zone) OWNER TO "postgres";

--
-- Name: auditoria; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."auditoria" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid",
    "accion" "text" NOT NULL,
    "entidad" "text" NOT NULL,
    "entidad_id" "uuid",
    "datos" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "auditoria_accion_check" CHECK (("length"(TRIM(BOTH FROM "accion")) > 0)),
    CONSTRAINT "auditoria_entidad_check" CHECK (("length"(TRIM(BOTH FROM "entidad")) > 0))
);


ALTER TABLE "public"."auditoria" OWNER TO "postgres";

--
-- Name: categorias; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."categorias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "activa" boolean DEFAULT true NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "categorias_nombre_check" CHECK (("length"(TRIM(BOTH FROM "nombre")) > 0))
);


ALTER TABLE "public"."categorias" OWNER TO "postgres";

--
-- Name: clientes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo_documento" "text" DEFAULT 'sin_documento'::"text" NOT NULL,
    "numero_documento" "text",
    "nombre" "text" NOT NULL,
    "direccion" "text",
    "telefono" "text",
    "correo" "text",
    "notas" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "creado_por" "uuid" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clientes_check" CHECK ((("tipo_documento" = 'sin_documento'::"text") OR ("length"(TRIM(BOTH FROM COALESCE("numero_documento", ''::"text"))) > 0))),
    CONSTRAINT "clientes_nombre_check" CHECK (("length"(TRIM(BOTH FROM "nombre")) > 0)),
    CONSTRAINT "clientes_tipo_documento_check" CHECK (("tipo_documento" = ANY (ARRAY['sin_documento'::"text", 'dni'::"text", 'ruc'::"text", 'ce'::"text", 'pasaporte'::"text"])))
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";

--
-- Name: combinaciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."combinaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "producto_id" "uuid" NOT NULL,
    "valor_opcion_1_id" "uuid",
    "valor_opcion_2_id" "uuid",
    "sku" "text" NOT NULL,
    "precio" numeric(12,2) NOT NULL,
    "existencias" numeric(12,3) DEFAULT 0 NOT NULL,
    "stock_minimo" numeric(12,3) DEFAULT 0 NOT NULL,
    "activa" boolean DEFAULT true NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "combinaciones_check" CHECK ((("valor_opcion_1_id" IS NOT NULL) OR ("valor_opcion_2_id" IS NOT NULL))),
    CONSTRAINT "combinaciones_precio_check" CHECK (("precio" >= (0)::numeric)),
    CONSTRAINT "combinaciones_sku_check" CHECK (("length"(TRIM(BOTH FROM "sku")) > 0)),
    CONSTRAINT "combinaciones_stock_minimo_check" CHECK (("stock_minimo" >= (0)::numeric))
);


ALTER TABLE "public"."combinaciones" OWNER TO "postgres";

--
-- Name: comprobantes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."comprobantes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venta_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "serie" "text" NOT NULL,
    "numero" bigint NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "respuesta_proveedor" "jsonb",
    "enlace_pdf" "text",
    "enlace_xml" "text",
    "enlace_cdr" "text",
    "cadena_qr" "text",
    "intentos" smallint DEFAULT 0 NOT NULL,
    "error_publico" "text",
    "solicitado_por" "uuid" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "procesando_hasta" timestamp with time zone,
    "respuesta_consulta_sunat" "jsonb",
    "consulta_sunat_desde" timestamp with time zone,
    "consultado_sunat_en" timestamp with time zone,
    "consulta_en_proceso_hasta" timestamp with time zone,
    CONSTRAINT "comprobantes_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'emitiendo'::"text", 'emitido'::"text", 'rechazado'::"text", 'error'::"text"]))),
    CONSTRAINT "comprobantes_intentos_check" CHECK (("intentos" >= 0)),
    CONSTRAINT "comprobantes_numero_check" CHECK (("numero" > 0)),
    CONSTRAINT "comprobantes_tipo_check" CHECK (("tipo" = ANY (ARRAY['boleta'::"text", 'factura'::"text"])))
);


ALTER TABLE "public"."comprobantes" OWNER TO "postgres";

--
-- Name: conversaciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."conversaciones" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "titulo" "text" DEFAULT 'Asistente'::"text" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "creada_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizada_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversaciones" OWNER TO "postgres";

--
-- Name: invitaciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."invitaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "correo" "text" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "invitado_por" "uuid" NOT NULL,
    "perfil_id" "uuid",
    "expira_en" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rol" "text" DEFAULT 'vendedor'::"text" NOT NULL,
    CONSTRAINT "invitaciones_correo_check" CHECK (("correo" = "lower"(TRIM(BOTH FROM "correo")))),
    CONSTRAINT "invitaciones_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'aceptada'::"text", 'cancelada'::"text"]))),
    CONSTRAINT "invitaciones_rol_check" CHECK (("rol" = ANY (ARRAY['administrador'::"text", 'vendedor'::"text"])))
);


ALTER TABLE "public"."invitaciones" OWNER TO "postgres";

--
-- Name: lineas_venta; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."lineas_venta" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venta_id" "uuid" NOT NULL,
    "producto_id" "uuid" NOT NULL,
    "combinacion_id" "uuid",
    "descripcion_congelada" "text" NOT NULL,
    "sku_congelado" "text" NOT NULL,
    "unidad_medida" "text" NOT NULL,
    "cantidad" numeric(12,3) NOT NULL,
    "precio_unitario" numeric(12,2) NOT NULL,
    "subtotal" numeric(12,2) NOT NULL,
    "igv" numeric(12,2) NOT NULL,
    "total" numeric(12,2) NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lineas_venta_cantidad_check" CHECK (("cantidad" > (0)::numeric)),
    CONSTRAINT "lineas_venta_descripcion_congelada_check" CHECK (("length"(TRIM(BOTH FROM "descripcion_congelada")) > 0)),
    CONSTRAINT "lineas_venta_igv_check" CHECK (("igv" >= (0)::numeric)),
    CONSTRAINT "lineas_venta_precio_unitario_check" CHECK (("precio_unitario" >= (0)::numeric)),
    CONSTRAINT "lineas_venta_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "lineas_venta_total_check" CHECK (("total" >= (0)::numeric))
);


ALTER TABLE "public"."lineas_venta" OWNER TO "postgres";

--
-- Name: mensajes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."mensajes" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "conversacion_id" "uuid" NOT NULL,
    "rol" "text" NOT NULL,
    "contenido" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "venta_id" "uuid",
    CONSTRAINT "mensajes_contenido_check" CHECK (("length"(TRIM(BOTH FROM "contenido")) > 0)),
    CONSTRAINT "mensajes_rol_check" CHECK (("rol" = ANY (ARRAY['usuario'::"text", 'asistente'::"text"])))
);


ALTER TABLE "public"."mensajes" OWNER TO "postgres";

--
-- Name: movimientos_inventario; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."movimientos_inventario" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "producto_id" "uuid" NOT NULL,
    "combinacion_id" "uuid",
    "tipo" "text" NOT NULL,
    "cantidad" numeric(12,3) NOT NULL,
    "existencias_resultantes" numeric(12,3) NOT NULL,
    "motivo" "text" NOT NULL,
    "venta_id" "uuid",
    "usuario_id" "uuid" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "movimientos_inventario_cantidad_check" CHECK (("cantidad" <> (0)::numeric)),
    CONSTRAINT "movimientos_inventario_check" CHECK ((("tipo" = 'venta'::"text") = ("venta_id" IS NOT NULL))),
    CONSTRAINT "movimientos_inventario_motivo_check" CHECK (("length"(TRIM(BOTH FROM "motivo")) > 0)),
    CONSTRAINT "movimientos_inventario_tipo_check" CHECK (("tipo" = ANY (ARRAY['ajuste'::"text", 'venta'::"text"])))
);


ALTER TABLE "public"."movimientos_inventario" OWNER TO "postgres";

--
-- Name: opciones_producto; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."opciones_producto" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "producto_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "posicion" smallint NOT NULL,
    CONSTRAINT "opciones_producto_nombre_check" CHECK (("length"(TRIM(BOTH FROM "nombre")) > 0)),
    CONSTRAINT "opciones_producto_posicion_check" CHECK (("posicion" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."opciones_producto" OWNER TO "postgres";

--
-- Name: perfiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."perfiles" (
    "id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "rol" "text" DEFAULT 'vendedor'::"text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "correo" "text",
    CONSTRAINT "perfiles_nombre_check" CHECK (("length"(TRIM(BOTH FROM "nombre")) > 0)),
    CONSTRAINT "perfiles_rol_check" CHECK (("rol" = ANY (ARRAY['administrador'::"text", 'vendedor'::"text"])))
);


ALTER TABLE "public"."perfiles" OWNER TO "postgres";

--
-- Name: productos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."productos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "categoria_id" "uuid",
    "sku" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "unidad_medida" "text" DEFAULT 'NIU'::"text" NOT NULL,
    "usa_combinaciones" boolean DEFAULT false NOT NULL,
    "precio" numeric(12,2),
    "existencias" numeric(12,3) DEFAULT 0 NOT NULL,
    "stock_minimo" numeric(12,3) DEFAULT 0 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "creado_por" "uuid" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "productos_check" CHECK (("usa_combinaciones" OR ("precio" IS NOT NULL))),
    CONSTRAINT "productos_check1" CHECK (((NOT "usa_combinaciones") OR ("precio" IS NULL))),
    CONSTRAINT "productos_nombre_check" CHECK (("length"(TRIM(BOTH FROM "nombre")) > 0)),
    CONSTRAINT "productos_precio_check" CHECK ((("precio" IS NULL) OR ("precio" >= (0)::numeric))),
    CONSTRAINT "productos_sku_check" CHECK (("length"(TRIM(BOTH FROM "sku")) > 0)),
    CONSTRAINT "productos_stock_minimo_check" CHECK (("stock_minimo" >= (0)::numeric)),
    CONSTRAINT "productos_unidad_medida_check" CHECK (("length"(TRIM(BOTH FROM "unidad_medida")) > 0))
);


ALTER TABLE "public"."productos" OWNER TO "postgres";

--
-- Name: valores_opcion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."valores_opcion" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "producto_id" "uuid" NOT NULL,
    "opcion_id" "uuid" NOT NULL,
    "valor" "text" NOT NULL,
    CONSTRAINT "valores_opcion_valor_check" CHECK (("length"(TRIM(BOTH FROM "valor")) > 0))
);


ALTER TABLE "public"."valores_opcion" OWNER TO "postgres";

--
-- Name: ventas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ventas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cliente_id" "uuid",
    "cliente_nombre" "text",
    "cliente_tipo_documento" "text",
    "cliente_numero_documento" "text",
    "cliente_direccion" "text",
    "estado" "text" DEFAULT 'borrador'::"text" NOT NULL,
    "moneda" "text" DEFAULT 'PEN'::"text" NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "igv" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "nota" "text",
    "creado_por" "uuid" NOT NULL,
    "confirmado_por" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmado_en" timestamp with time zone,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tipo_comprobante" "text",
    CONSTRAINT "ventas_check" CHECK ((("estado" = 'confirmada'::"text") = ("confirmado_en" IS NOT NULL))),
    CONSTRAINT "ventas_estado_check" CHECK (("estado" = ANY (ARRAY['borrador'::"text", 'confirmada'::"text", 'descartada'::"text"]))),
    CONSTRAINT "ventas_igv_check" CHECK (("igv" >= (0)::numeric)),
    CONSTRAINT "ventas_moneda_check" CHECK (("moneda" = ANY (ARRAY['PEN'::"text", 'USD'::"text"]))),
    CONSTRAINT "ventas_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "ventas_tipo_comprobante_check" CHECK ((("tipo_comprobante" IS NULL) OR ("tipo_comprobante" = ANY (ARRAY['factura'::"text", 'boleta'::"text"])))),
    CONSTRAINT "ventas_total_check" CHECK (("total" >= (0)::numeric))
);


ALTER TABLE "public"."ventas" OWNER TO "postgres";

--
-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."auditoria"
    ADD CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id");


--
-- Name: categorias categorias_nombre_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_nombre_key" UNIQUE ("nombre");


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_pkey" PRIMARY KEY ("id");


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");


--
-- Name: combinaciones combinaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."combinaciones"
    ADD CONSTRAINT "combinaciones_pkey" PRIMARY KEY ("id");


--
-- Name: combinaciones combinaciones_producto_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."combinaciones"
    ADD CONSTRAINT "combinaciones_producto_id_id_key" UNIQUE ("producto_id", "id");


--
-- Name: combinaciones combinaciones_producto_id_valor_opcion_1_id_valor_opcion_2__key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."combinaciones"
    ADD CONSTRAINT "combinaciones_producto_id_valor_opcion_1_id_valor_opcion_2__key" UNIQUE NULLS NOT DISTINCT ("producto_id", "valor_opcion_1_id", "valor_opcion_2_id");


--
-- Name: combinaciones combinaciones_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."combinaciones"
    ADD CONSTRAINT "combinaciones_sku_key" UNIQUE ("sku");


--
-- Name: comprobantes comprobantes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comprobantes"
    ADD CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id");


--
-- Name: comprobantes comprobantes_serie_numero_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comprobantes"
    ADD CONSTRAINT "comprobantes_serie_numero_key" UNIQUE ("serie", "numero");


--
-- Name: comprobantes comprobantes_venta_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comprobantes"
    ADD CONSTRAINT "comprobantes_venta_id_key" UNIQUE ("venta_id");


--
-- Name: conversaciones conversaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."conversaciones"
    ADD CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("id");


--
-- Name: empresa empresa_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."empresa"
    ADD CONSTRAINT "empresa_pkey" PRIMARY KEY ("unica");


--
-- Name: invitaciones invitaciones_correo_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invitaciones"
    ADD CONSTRAINT "invitaciones_correo_key" UNIQUE ("correo");


--
-- Name: invitaciones invitaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invitaciones"
    ADD CONSTRAINT "invitaciones_pkey" PRIMARY KEY ("id");


--
-- Name: lineas_venta lineas_venta_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lineas_venta"
    ADD CONSTRAINT "lineas_venta_pkey" PRIMARY KEY ("id");


--
-- Name: mensajes mensajes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mensajes"
    ADD CONSTRAINT "mensajes_pkey" PRIMARY KEY ("id");


--
-- Name: mensajes mensajes_venta_solo_asistente; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE "public"."mensajes"
    ADD CONSTRAINT "mensajes_venta_solo_asistente" CHECK ((("venta_id" IS NULL) OR ("rol" = 'asistente'::"text"))) NOT VALID;


--
-- Name: movimientos_inventario movimientos_inventario_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."movimientos_inventario"
    ADD CONSTRAINT "movimientos_inventario_pkey" PRIMARY KEY ("id");


--
-- Name: opciones_producto opciones_producto_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."opciones_producto"
    ADD CONSTRAINT "opciones_producto_pkey" PRIMARY KEY ("id");


--
-- Name: opciones_producto opciones_producto_producto_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."opciones_producto"
    ADD CONSTRAINT "opciones_producto_producto_id_id_key" UNIQUE ("producto_id", "id");


--
-- Name: opciones_producto opciones_producto_producto_id_posicion_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."opciones_producto"
    ADD CONSTRAINT "opciones_producto_producto_id_posicion_key" UNIQUE ("producto_id", "posicion");


--
-- Name: perfiles perfiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_pkey" PRIMARY KEY ("id");


--
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_pkey" PRIMARY KEY ("id");


--
-- Name: productos productos_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_sku_key" UNIQUE ("sku");


--
-- Name: series_comprobante series_comprobante_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."series_comprobante"
    ADD CONSTRAINT "series_comprobante_pkey" PRIMARY KEY ("id");


--
-- Name: series_comprobante series_comprobante_tipo_serie_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."series_comprobante"
    ADD CONSTRAINT "series_comprobante_tipo_serie_key" UNIQUE ("tipo", "serie");


--
-- Name: valores_opcion valores_opcion_opcion_id_valor_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."valores_opcion"
    ADD CONSTRAINT "valores_opcion_opcion_id_valor_key" UNIQUE ("opcion_id", "valor");


--
-- Name: valores_opcion valores_opcion_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."valores_opcion"
    ADD CONSTRAINT "valores_opcion_pkey" PRIMARY KEY ("id");


--
-- Name: valores_opcion valores_opcion_producto_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."valores_opcion"
    ADD CONSTRAINT "valores_opcion_producto_id_id_key" UNIQUE ("producto_id", "id");


--
-- Name: ventas ventas_cliente_obligatorio; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ventas"
    ADD CONSTRAINT "ventas_cliente_obligatorio" CHECK ((("cliente_id" IS NOT NULL) OR ("estado" = 'descartada'::"text"))) NOT VALID;


--
-- Name: ventas ventas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_pkey" PRIMARY KEY ("id");


--
-- Name: auditoria_entidad_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "auditoria_entidad_idx" ON "public"."auditoria" USING "btree" ("entidad", "entidad_id", "creado_en" DESC);


--
-- Name: clientes_nombre_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "clientes_nombre_idx" ON "public"."clientes" USING "btree" ("nombre");


--
-- Name: combinaciones_producto_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "combinaciones_producto_idx" ON "public"."combinaciones" USING "btree" ("producto_id");


--
-- Name: comprobantes_estado_fecha_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "comprobantes_estado_fecha_idx" ON "public"."comprobantes" USING "btree" ("estado", "creado_en" DESC);


--
-- Name: conversaciones_usuario_fecha_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "conversaciones_usuario_fecha_idx" ON "public"."conversaciones" USING "btree" ("usuario_id", "actualizada_en" DESC);


--
-- Name: invitaciones_estado_expira_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invitaciones_estado_expira_idx" ON "public"."invitaciones" USING "btree" ("estado", "expira_en");


--
-- Name: lineas_venta_producto_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "lineas_venta_producto_idx" ON "public"."lineas_venta" USING "btree" ("producto_id");


--
-- Name: lineas_venta_venta_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "lineas_venta_venta_idx" ON "public"."lineas_venta" USING "btree" ("venta_id");


--
-- Name: mensajes_conversacion_fecha_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "mensajes_conversacion_fecha_idx" ON "public"."mensajes" USING "btree" ("conversacion_id", "creado_en" DESC);


--
-- Name: movimientos_combinacion_fecha_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "movimientos_combinacion_fecha_idx" ON "public"."movimientos_inventario" USING "btree" ("combinacion_id", "creado_en" DESC) WHERE ("combinacion_id" IS NOT NULL);


--
-- Name: movimientos_producto_fecha_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "movimientos_producto_fecha_idx" ON "public"."movimientos_inventario" USING "btree" ("producto_id", "creado_en" DESC);


--
-- Name: opciones_producto_producto_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "opciones_producto_producto_idx" ON "public"."opciones_producto" USING "btree" ("producto_id");


--
-- Name: perfiles_correo_normalizado_unico; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "perfiles_correo_normalizado_unico" ON "public"."perfiles" USING "btree" ("lower"("correo")) WHERE ("correo" IS NOT NULL);


--
-- Name: productos_categoria_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "productos_categoria_idx" ON "public"."productos" USING "btree" ("categoria_id");


--
-- Name: series_comprobante_una_activa_por_tipo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "series_comprobante_una_activa_por_tipo" ON "public"."series_comprobante" USING "btree" ("tipo") WHERE "activa";


--
-- Name: valores_opcion_producto_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "valores_opcion_producto_idx" ON "public"."valores_opcion" USING "btree" ("producto_id");


--
-- Name: ventas_creado_por_fecha_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ventas_creado_por_fecha_idx" ON "public"."ventas" USING "btree" ("creado_por", "creado_en" DESC);


--
-- Name: ventas_estado_fecha_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ventas_estado_fecha_idx" ON "public"."ventas" USING "btree" ("estado", "creado_en" DESC);


--
-- Name: clientes clientes_validar_documento; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "clientes_validar_documento" BEFORE INSERT OR UPDATE ON "public"."clientes" FOR EACH ROW EXECUTE FUNCTION "private"."validar_documento_cliente"();


--
-- Name: clientes validar_estado_cliente; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "validar_estado_cliente" BEFORE UPDATE OF "activo" ON "public"."clientes" FOR EACH ROW EXECUTE FUNCTION "private"."validar_cambio_estado_cliente"();


--
-- Name: auditoria auditoria_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."auditoria"
    ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;


--
-- Name: clientes clientes_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id") ON DELETE RESTRICT;


--
-- Name: combinaciones combinaciones_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."combinaciones"
    ADD CONSTRAINT "combinaciones_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;


--
-- Name: combinaciones combinaciones_producto_id_valor_opcion_1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."combinaciones"
    ADD CONSTRAINT "combinaciones_producto_id_valor_opcion_1_id_fkey" FOREIGN KEY ("producto_id", "valor_opcion_1_id") REFERENCES "public"."valores_opcion"("producto_id", "id") ON DELETE RESTRICT;


--
-- Name: combinaciones combinaciones_producto_id_valor_opcion_2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."combinaciones"
    ADD CONSTRAINT "combinaciones_producto_id_valor_opcion_2_id_fkey" FOREIGN KEY ("producto_id", "valor_opcion_2_id") REFERENCES "public"."valores_opcion"("producto_id", "id") ON DELETE RESTRICT;


--
-- Name: comprobantes comprobantes_solicitado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comprobantes"
    ADD CONSTRAINT "comprobantes_solicitado_por_fkey" FOREIGN KEY ("solicitado_por") REFERENCES "public"."perfiles"("id") ON DELETE RESTRICT;


--
-- Name: comprobantes comprobantes_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comprobantes"
    ADD CONSTRAINT "comprobantes_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE RESTRICT;


--
-- Name: conversaciones conversaciones_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."conversaciones"
    ADD CONSTRAINT "conversaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfiles"("id") ON DELETE RESTRICT;


--
-- Name: empresa empresa_actualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."empresa"
    ADD CONSTRAINT "empresa_actualizado_por_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;


--
-- Name: invitaciones invitaciones_invitado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invitaciones"
    ADD CONSTRAINT "invitaciones_invitado_por_fkey" FOREIGN KEY ("invitado_por") REFERENCES "public"."perfiles"("id") ON DELETE RESTRICT;


--
-- Name: invitaciones invitaciones_perfil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invitaciones"
    ADD CONSTRAINT "invitaciones_perfil_id_fkey" FOREIGN KEY ("perfil_id") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;


--
-- Name: lineas_venta lineas_venta_producto_id_combinacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lineas_venta"
    ADD CONSTRAINT "lineas_venta_producto_id_combinacion_id_fkey" FOREIGN KEY ("producto_id", "combinacion_id") REFERENCES "public"."combinaciones"("producto_id", "id") ON DELETE RESTRICT;


--
-- Name: lineas_venta lineas_venta_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lineas_venta"
    ADD CONSTRAINT "lineas_venta_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE RESTRICT;


--
-- Name: lineas_venta lineas_venta_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lineas_venta"
    ADD CONSTRAINT "lineas_venta_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE CASCADE;


--
-- Name: mensajes mensajes_conversacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mensajes"
    ADD CONSTRAINT "mensajes_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "public"."conversaciones"("id") ON DELETE CASCADE;


--
-- Name: mensajes mensajes_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mensajes"
    ADD CONSTRAINT "mensajes_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE SET NULL;


--
-- Name: movimientos_inventario movimientos_inventario_producto_id_combinacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."movimientos_inventario"
    ADD CONSTRAINT "movimientos_inventario_producto_id_combinacion_id_fkey" FOREIGN KEY ("producto_id", "combinacion_id") REFERENCES "public"."combinaciones"("producto_id", "id") ON DELETE RESTRICT;


--
-- Name: movimientos_inventario movimientos_inventario_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."movimientos_inventario"
    ADD CONSTRAINT "movimientos_inventario_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE RESTRICT;


--
-- Name: movimientos_inventario movimientos_inventario_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."movimientos_inventario"
    ADD CONSTRAINT "movimientos_inventario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."perfiles"("id") ON DELETE RESTRICT;


--
-- Name: movimientos_inventario movimientos_inventario_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."movimientos_inventario"
    ADD CONSTRAINT "movimientos_inventario_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE RESTRICT;


--
-- Name: opciones_producto opciones_producto_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."opciones_producto"
    ADD CONSTRAINT "opciones_producto_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;


--
-- Name: perfiles perfiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;


--
-- Name: productos productos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE SET NULL;


--
-- Name: productos productos_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id") ON DELETE RESTRICT;


--
-- Name: series_comprobante series_comprobante_actualizado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."series_comprobante"
    ADD CONSTRAINT "series_comprobante_actualizado_por_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "public"."perfiles"("id") ON DELETE SET NULL;


--
-- Name: valores_opcion valores_opcion_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."valores_opcion"
    ADD CONSTRAINT "valores_opcion_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE CASCADE;


--
-- Name: valores_opcion valores_opcion_producto_id_opcion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."valores_opcion"
    ADD CONSTRAINT "valores_opcion_producto_id_opcion_id_fkey" FOREIGN KEY ("producto_id", "opcion_id") REFERENCES "public"."opciones_producto"("producto_id", "id") ON DELETE CASCADE;


--
-- Name: ventas ventas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE SET NULL;


--
-- Name: ventas ventas_confirmado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_confirmado_por_fkey" FOREIGN KEY ("confirmado_por") REFERENCES "public"."perfiles"("id") ON DELETE RESTRICT;


--
-- Name: ventas ventas_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ventas"
    ADD CONSTRAINT "ventas_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."perfiles"("id") ON DELETE RESTRICT;


--
-- Name: auditoria; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."auditoria" ENABLE ROW LEVEL SECURITY;

--
-- Name: auditoria auditoria_lectura_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "auditoria_lectura_admin" ON "public"."auditoria" FOR SELECT TO "authenticated" USING (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol"));


--
-- Name: categorias; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."categorias" ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias categorias_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "categorias_admin" ON "public"."categorias" TO "authenticated" USING (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol")) WITH CHECK (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol"));


--
-- Name: categorias categorias_lectura_equipo; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "categorias_lectura_equipo" ON "public"."categorias" FOR SELECT TO "authenticated" USING (( SELECT "private"."usuario_activo"() AS "usuario_activo"));


--
-- Name: clientes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;

--
-- Name: clientes clientes_actualizacion_equipo; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "clientes_actualizacion_equipo" ON "public"."clientes" FOR UPDATE TO "authenticated" USING (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text", 'vendedor'::"text"]) AS "tiene_rol")) WITH CHECK (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text", 'vendedor'::"text"]) AS "tiene_rol"));


--
-- Name: clientes clientes_escritura_equipo; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "clientes_escritura_equipo" ON "public"."clientes" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text", 'vendedor'::"text"]) AS "tiene_rol") AND ("creado_por" = ( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: clientes clientes_lectura_equipo; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "clientes_lectura_equipo" ON "public"."clientes" FOR SELECT TO "authenticated" USING (( SELECT "private"."usuario_activo"() AS "usuario_activo"));


--
-- Name: combinaciones; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."combinaciones" ENABLE ROW LEVEL SECURITY;

--
-- Name: combinaciones combinaciones_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "combinaciones_admin" ON "public"."combinaciones" TO "authenticated" USING (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol")) WITH CHECK (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol"));


--
-- Name: combinaciones combinaciones_lectura_equipo; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "combinaciones_lectura_equipo" ON "public"."combinaciones" FOR SELECT TO "authenticated" USING (( SELECT "private"."usuario_activo"() AS "usuario_activo"));


--
-- Name: comprobantes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."comprobantes" ENABLE ROW LEVEL SECURITY;

--
-- Name: comprobantes comprobantes_lectura_por_venta; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "comprobantes_lectura_por_venta" ON "public"."comprobantes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."ventas" "v"
  WHERE (("v"."id" = "comprobantes"."venta_id") AND (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol") OR ("v"."creado_por" = ( SELECT "auth"."uid"() AS "uid")))))));


--
-- Name: conversaciones; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."conversaciones" ENABLE ROW LEVEL SECURITY;

--
-- Name: conversaciones conversaciones_propias_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "conversaciones_propias_insert" ON "public"."conversaciones" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text", 'vendedor'::"text"]) AS "tiene_rol") AND ("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: conversaciones conversaciones_propias_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "conversaciones_propias_select" ON "public"."conversaciones" FOR SELECT TO "authenticated" USING ((( SELECT "private"."usuario_activo"() AS "usuario_activo") AND ("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: conversaciones conversaciones_propias_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "conversaciones_propias_update" ON "public"."conversaciones" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."usuario_activo"() AS "usuario_activo") AND ("usuario_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "private"."usuario_activo"() AS "usuario_activo") AND ("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: empresa; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."empresa" ENABLE ROW LEVEL SECURITY;

--
-- Name: empresa empresa_edicion_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "empresa_edicion_admin" ON "public"."empresa" FOR UPDATE TO "authenticated" USING (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol")) WITH CHECK (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol"));


--
-- Name: empresa empresa_lectura_equipo; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "empresa_lectura_equipo" ON "public"."empresa" FOR SELECT TO "authenticated" USING (( SELECT "private"."usuario_activo"() AS "usuario_activo"));


--
-- Name: invitaciones; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."invitaciones" ENABLE ROW LEVEL SECURITY;

--
-- Name: invitaciones invitaciones_lectura_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "invitaciones_lectura_admin" ON "public"."invitaciones" FOR SELECT TO "authenticated" USING (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol"));


--
-- Name: lineas_venta; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lineas_venta" ENABLE ROW LEVEL SECURITY;

--
-- Name: lineas_venta lineas_venta_lectura_por_venta; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "lineas_venta_lectura_por_venta" ON "public"."lineas_venta" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."ventas" "v"
  WHERE (("v"."id" = "lineas_venta"."venta_id") AND (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol") OR ("v"."creado_por" = ( SELECT "auth"."uid"() AS "uid")))))));


--
-- Name: mensajes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."mensajes" ENABLE ROW LEVEL SECURITY;

--
-- Name: mensajes mensajes_propios_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mensajes_propios_select" ON "public"."mensajes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversaciones" "c"
  WHERE (("c"."id" = "mensajes"."conversacion_id") AND ("c"."usuario_id" = ( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: mensajes mensajes_usuario_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mensajes_usuario_insert" ON "public"."mensajes" FOR INSERT TO "authenticated" WITH CHECK ((("rol" = 'usuario'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."conversaciones" "c"
  WHERE (("c"."id" = "mensajes"."conversacion_id") AND ("c"."usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."usuario_activo"() AS "usuario_activo"))))));


--
-- Name: movimientos_inventario; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."movimientos_inventario" ENABLE ROW LEVEL SECURITY;

--
-- Name: movimientos_inventario movimientos_lectura_por_rol; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "movimientos_lectura_por_rol" ON "public"."movimientos_inventario" FOR SELECT TO "authenticated" USING ((( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol") OR (EXISTS ( SELECT 1
   FROM "public"."ventas" "v"
  WHERE (("v"."id" = "movimientos_inventario"."venta_id") AND ("v"."creado_por" = ( SELECT "auth"."uid"() AS "uid")))))));


--
-- Name: opciones_producto; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."opciones_producto" ENABLE ROW LEVEL SECURITY;

--
-- Name: opciones_producto opciones_producto_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "opciones_producto_admin" ON "public"."opciones_producto" TO "authenticated" USING (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol")) WITH CHECK (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol"));


--
-- Name: opciones_producto opciones_producto_lectura_equipo; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "opciones_producto_lectura_equipo" ON "public"."opciones_producto" FOR SELECT TO "authenticated" USING (( SELECT "private"."usuario_activo"() AS "usuario_activo"));


--
-- Name: perfiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."perfiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: perfiles perfiles_lectura_propios_o_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "perfiles_lectura_propios_o_admin" ON "public"."perfiles" FOR SELECT TO "authenticated" USING ((( SELECT "private"."usuario_activo"() AS "usuario_activo") AND (("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol"))));


--
-- Name: productos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."productos" ENABLE ROW LEVEL SECURITY;

--
-- Name: productos productos_actualizar_vendedor; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "productos_actualizar_vendedor" ON "public"."productos" FOR UPDATE TO "authenticated" USING (( SELECT "private"."tiene_rol"(ARRAY['vendedor'::"text"]) AS "tiene_rol")) WITH CHECK (( SELECT "private"."tiene_rol"(ARRAY['vendedor'::"text"]) AS "tiene_rol"));


--
-- Name: productos productos_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "productos_admin" ON "public"."productos" TO "authenticated" USING (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol")) WITH CHECK (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol"));


--
-- Name: productos productos_crear_vendedor; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "productos_crear_vendedor" ON "public"."productos" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."tiene_rol"(ARRAY['vendedor'::"text"]) AS "tiene_rol") AND ("creado_por" = ( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: productos productos_lectura_equipo; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "productos_lectura_equipo" ON "public"."productos" FOR SELECT TO "authenticated" USING (( SELECT "private"."usuario_activo"() AS "usuario_activo"));


--
-- Name: series_comprobante series_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "series_admin" ON "public"."series_comprobante" TO "authenticated" USING (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol")) WITH CHECK (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol"));


--
-- Name: series_comprobante; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."series_comprobante" ENABLE ROW LEVEL SECURITY;

--
-- Name: series_comprobante series_lectura_equipo; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "series_lectura_equipo" ON "public"."series_comprobante" FOR SELECT TO "authenticated" USING (( SELECT "private"."usuario_activo"() AS "usuario_activo"));


--
-- Name: valores_opcion; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."valores_opcion" ENABLE ROW LEVEL SECURITY;

--
-- Name: valores_opcion valores_opcion_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "valores_opcion_admin" ON "public"."valores_opcion" TO "authenticated" USING (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol")) WITH CHECK (( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol"));


--
-- Name: valores_opcion valores_opcion_lectura_equipo; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "valores_opcion_lectura_equipo" ON "public"."valores_opcion" FOR SELECT TO "authenticated" USING (( SELECT "private"."usuario_activo"() AS "usuario_activo"));


--
-- Name: ventas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ventas" ENABLE ROW LEVEL SECURITY;

--
-- Name: ventas ventas_lectura_por_rol; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ventas_lectura_por_rol" ON "public"."ventas" FOR SELECT TO "authenticated" USING ((( SELECT "private"."tiene_rol"(ARRAY['administrador'::"text"]) AS "tiene_rol") OR (( SELECT "private"."tiene_rol"(ARRAY['vendedor'::"text"]) AS "tiene_rol") AND ("creado_por" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: SCHEMA "private"; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA "private" TO "authenticated";


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "ruc_valido"("valor" "text"); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."ruc_valido"("valor" "text") FROM PUBLIC;


--
-- Name: FUNCTION "sincronizar_correo_auth"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."sincronizar_correo_auth"() FROM PUBLIC;


--
-- Name: FUNCTION "tiene_rol"("roles_permitidos" "text"[]); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."tiene_rol"("roles_permitidos" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."tiene_rol"("roles_permitidos" "text"[]) TO "authenticated";


--
-- Name: FUNCTION "usuario_activo"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."usuario_activo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."usuario_activo"() TO "authenticated";


--
-- Name: FUNCTION "validar_cambio_estado_cliente"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."validar_cambio_estado_cliente"() FROM PUBLIC;


--
-- Name: FUNCTION "validar_documento_cliente"(); Type: ACL; Schema: private; Owner: postgres
--

REVOKE ALL ON FUNCTION "private"."validar_documento_cliente"() FROM PUBLIC;


--
-- Name: FUNCTION "ajustar_existencias"("producto_objetivo" "uuid", "combinacion_objetivo" "uuid", "cambio" numeric, "razon" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."ajustar_existencias"("producto_objetivo" "uuid", "combinacion_objetivo" "uuid", "cambio" numeric, "razon" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ajustar_existencias"("producto_objetivo" "uuid", "combinacion_objetivo" "uuid", "cambio" numeric, "razon" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ajustar_existencias"("producto_objetivo" "uuid", "combinacion_objetivo" "uuid", "cambio" numeric, "razon" "text") TO "service_role";


--
-- Name: FUNCTION "asistente_buscar_productos"("texto_busqueda" "text", "max_resultados" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."asistente_buscar_productos"("texto_busqueda" "text", "max_resultados" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."asistente_buscar_productos"("texto_busqueda" "text", "max_resultados" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."asistente_buscar_productos"("texto_busqueda" "text", "max_resultados" integer) TO "service_role";


--
-- Name: FUNCTION "asistente_consultar_modulo"("modulo" "text", "busqueda" "text", "desde" timestamp with time zone, "hasta" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."asistente_consultar_modulo"("modulo" "text", "busqueda" "text", "desde" timestamp with time zone, "hasta" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."asistente_consultar_modulo"("modulo" "text", "busqueda" "text", "desde" timestamp with time zone, "hasta" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."asistente_consultar_modulo"("modulo" "text", "busqueda" "text", "desde" timestamp with time zone, "hasta" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "asistente_resumen_catalogo"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."asistente_resumen_catalogo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."asistente_resumen_catalogo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."asistente_resumen_catalogo"() TO "service_role";


--
-- Name: FUNCTION "asistente_resumen_ventas"("desde" timestamp with time zone, "hasta" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."asistente_resumen_ventas"("desde" timestamp with time zone, "hasta" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."asistente_resumen_ventas"("desde" timestamp with time zone, "hasta" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."asistente_resumen_ventas"("desde" timestamp with time zone, "hasta" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "cambiar_estado_cliente"("cliente_objetivo" "uuid", "activar" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."cambiar_estado_cliente"("cliente_objetivo" "uuid", "activar" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cambiar_estado_cliente"("cliente_objetivo" "uuid", "activar" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cambiar_estado_cliente"("cliente_objetivo" "uuid", "activar" boolean) TO "service_role";


--
-- Name: FUNCTION "cambiar_estado_vendedor"("usuario_objetivo" "uuid", "activar" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."cambiar_estado_vendedor"("usuario_objetivo" "uuid", "activar" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cambiar_estado_vendedor"("usuario_objetivo" "uuid", "activar" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cambiar_estado_vendedor"("usuario_objetivo" "uuid", "activar" boolean) TO "service_role";


--
-- Name: TABLE "series_comprobante"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."series_comprobante" TO "service_role";
GRANT SELECT ON TABLE "public"."series_comprobante" TO "authenticated";


--
-- Name: FUNCTION "configurar_serie_comprobante"("administrador_objetivo" "uuid", "tipo_solicitado" "text", "serie_solicitada" "text", "siguiente_solicitado" bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."configurar_serie_comprobante"("administrador_objetivo" "uuid", "tipo_solicitado" "text", "serie_solicitada" "text", "siguiente_solicitado" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."configurar_serie_comprobante"("administrador_objetivo" "uuid", "tipo_solicitado" "text", "serie_solicitada" "text", "siguiente_solicitado" bigint) TO "service_role";


--
-- Name: FUNCTION "configurar_serie_factura"("administrador_objetivo" "uuid", "serie_solicitada" "text", "siguiente_solicitado" bigint); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."configurar_serie_factura"("administrador_objetivo" "uuid", "serie_solicitada" "text", "siguiente_solicitado" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."configurar_serie_factura"("administrador_objetivo" "uuid", "serie_solicitada" "text", "siguiente_solicitado" bigint) TO "service_role";


--
-- Name: FUNCTION "confirmar_venta"("venta_objetivo" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."confirmar_venta"("venta_objetivo" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirmar_venta"("venta_objetivo" "uuid") TO "service_role";


--
-- Name: FUNCTION "confirmar_venta_con_comprobante"("venta_objetivo" "uuid", "tipo_comprobante_solicitado" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."confirmar_venta_con_comprobante"("venta_objetivo" "uuid", "tipo_comprobante_solicitado" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirmar_venta_con_comprobante"("venta_objetivo" "uuid", "tipo_comprobante_solicitado" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirmar_venta_con_comprobante"("venta_objetivo" "uuid", "tipo_comprobante_solicitado" "text") TO "service_role";


--
-- Name: FUNCTION "crear_borrador_venta"("cliente_objetivo" "uuid", "lineas" "jsonb", "venta_objetivo" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."crear_borrador_venta"("cliente_objetivo" "uuid", "lineas" "jsonb", "venta_objetivo" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_borrador_venta"("cliente_objetivo" "uuid", "lineas" "jsonb", "venta_objetivo" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_borrador_venta"("cliente_objetivo" "uuid", "lineas" "jsonb", "venta_objetivo" "uuid") TO "service_role";


--
-- Name: FUNCTION "crear_borrador_venta_con_comprobante"("cliente_objetivo" "uuid", "lineas" "jsonb", "tipo_comprobante_solicitado" "text", "venta_objetivo" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."crear_borrador_venta_con_comprobante"("cliente_objetivo" "uuid", "lineas" "jsonb", "tipo_comprobante_solicitado" "text", "venta_objetivo" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_borrador_venta_con_comprobante"("cliente_objetivo" "uuid", "lineas" "jsonb", "tipo_comprobante_solicitado" "text", "venta_objetivo" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_borrador_venta_con_comprobante"("cliente_objetivo" "uuid", "lineas" "jsonb", "tipo_comprobante_solicitado" "text", "venta_objetivo" "uuid") TO "service_role";


--
-- Name: FUNCTION "crear_producto_con_combinaciones"("sku_producto" "text", "nombre_producto" "text", "categoria_objetivo" "uuid", "unidad" "text", "precio_base" numeric, "minimo_stock" numeric, "opciones" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."crear_producto_con_combinaciones"("sku_producto" "text", "nombre_producto" "text", "categoria_objetivo" "uuid", "unidad" "text", "precio_base" numeric, "minimo_stock" numeric, "opciones" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_producto_con_combinaciones"("sku_producto" "text", "nombre_producto" "text", "categoria_objetivo" "uuid", "unidad" "text", "precio_base" numeric, "minimo_stock" numeric, "opciones" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_producto_con_combinaciones"("sku_producto" "text", "nombre_producto" "text", "categoria_objetivo" "uuid", "unidad" "text", "precio_base" numeric, "minimo_stock" numeric, "opciones" "jsonb") TO "service_role";


--
-- Name: FUNCTION "descartar_borrador_venta"("venta_objetivo" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."descartar_borrador_venta"("venta_objetivo" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."descartar_borrador_venta"("venta_objetivo" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."descartar_borrador_venta"("venta_objetivo" "uuid") TO "service_role";


--
-- Name: TABLE "empresa"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."empresa" TO "service_role";
GRANT SELECT ON TABLE "public"."empresa" TO "authenticated";


--
-- Name: FUNCTION "guardar_empresa"("nombre_empresa" "text", "ruc_empresa" "text", "direccion_empresa" "text", "telefono_empresa" "text", "correo_empresa" "text", "moneda_empresa" "text", "igv_habilitado" boolean, "tasa_igv" numeric, "precios_con_igv" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."guardar_empresa"("nombre_empresa" "text", "ruc_empresa" "text", "direccion_empresa" "text", "telefono_empresa" "text", "correo_empresa" "text", "moneda_empresa" "text", "igv_habilitado" boolean, "tasa_igv" numeric, "precios_con_igv" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guardar_empresa"("nombre_empresa" "text", "ruc_empresa" "text", "direccion_empresa" "text", "telefono_empresa" "text", "correo_empresa" "text", "moneda_empresa" "text", "igv_habilitado" boolean, "tasa_igv" numeric, "precios_con_igv" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."guardar_empresa"("nombre_empresa" "text", "ruc_empresa" "text", "direccion_empresa" "text", "telefono_empresa" "text", "correo_empresa" "text", "moneda_empresa" "text", "igv_habilitado" boolean, "tasa_igv" numeric, "precios_con_igv" boolean) TO "service_role";


--
-- Name: FUNCTION "inicializar_administrador"("usuario_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."inicializar_administrador"("usuario_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inicializar_administrador"("usuario_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "registrar_consulta_boleta"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid", "respuesta" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."registrar_consulta_boleta"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid", "respuesta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_consulta_boleta"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid", "respuesta" "jsonb") TO "service_role";


--
-- Name: FUNCTION "registrar_resultado_comprobante"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid", "estado_resultado" "text", "respuesta" "jsonb", "error_mostrable" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."registrar_resultado_comprobante"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid", "estado_resultado" "text", "respuesta" "jsonb", "error_mostrable" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_resultado_comprobante"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid", "estado_resultado" "text", "respuesta" "jsonb", "error_mostrable" "text") TO "service_role";


--
-- Name: FUNCTION "reporte_ventas"("desde" timestamp with time zone, "hasta" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reporte_ventas"("desde" timestamp with time zone, "hasta" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reporte_ventas"("desde" timestamp with time zone, "hasta" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reporte_ventas"("desde" timestamp with time zone, "hasta" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "reservar_comprobante"("administrador_objetivo" "uuid", "venta_objetivo" "uuid", "tipo_solicitado" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reservar_comprobante"("administrador_objetivo" "uuid", "venta_objetivo" "uuid", "tipo_solicitado" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reservar_comprobante"("administrador_objetivo" "uuid", "venta_objetivo" "uuid", "tipo_solicitado" "text") TO "service_role";


--
-- Name: FUNCTION "reservar_consulta_boleta"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reservar_consulta_boleta"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reservar_consulta_boleta"("administrador_objetivo" "uuid", "comprobante_objetivo" "uuid") TO "service_role";


--
-- Name: FUNCTION "resumen_inicio"("desde" timestamp with time zone, "hasta" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."resumen_inicio"("desde" timestamp with time zone, "hasta" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resumen_inicio"("desde" timestamp with time zone, "hasta" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resumen_inicio"("desde" timestamp with time zone, "hasta" timestamp with time zone) TO "service_role";


--
-- Name: TABLE "auditoria"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."auditoria" TO "service_role";
GRANT SELECT ON TABLE "public"."auditoria" TO "authenticated";


--
-- Name: TABLE "categorias"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."categorias" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."categorias" TO "authenticated";


--
-- Name: TABLE "clientes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."clientes" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."clientes" TO "authenticated";


--
-- Name: TABLE "combinaciones"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."combinaciones" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."combinaciones" TO "authenticated";


--
-- Name: COLUMN "combinaciones"."producto_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("producto_id") ON TABLE "public"."combinaciones" TO "authenticated";


--
-- Name: COLUMN "combinaciones"."valor_opcion_1_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("valor_opcion_1_id"),UPDATE("valor_opcion_1_id") ON TABLE "public"."combinaciones" TO "authenticated";


--
-- Name: COLUMN "combinaciones"."valor_opcion_2_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("valor_opcion_2_id"),UPDATE("valor_opcion_2_id") ON TABLE "public"."combinaciones" TO "authenticated";


--
-- Name: COLUMN "combinaciones"."sku"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("sku"),UPDATE("sku") ON TABLE "public"."combinaciones" TO "authenticated";


--
-- Name: COLUMN "combinaciones"."precio"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("precio"),UPDATE("precio") ON TABLE "public"."combinaciones" TO "authenticated";


--
-- Name: COLUMN "combinaciones"."stock_minimo"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("stock_minimo"),UPDATE("stock_minimo") ON TABLE "public"."combinaciones" TO "authenticated";


--
-- Name: COLUMN "combinaciones"."activa"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("activa"),UPDATE("activa") ON TABLE "public"."combinaciones" TO "authenticated";


--
-- Name: TABLE "comprobantes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."comprobantes" TO "service_role";
GRANT SELECT ON TABLE "public"."comprobantes" TO "authenticated";


--
-- Name: TABLE "conversaciones"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."conversaciones" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."conversaciones" TO "authenticated";


--
-- Name: TABLE "invitaciones"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."invitaciones" TO "service_role";
GRANT SELECT ON TABLE "public"."invitaciones" TO "authenticated";


--
-- Name: TABLE "lineas_venta"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lineas_venta" TO "service_role";
GRANT SELECT ON TABLE "public"."lineas_venta" TO "authenticated";


--
-- Name: TABLE "mensajes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."mensajes" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."mensajes" TO "authenticated";


--
-- Name: TABLE "movimientos_inventario"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."movimientos_inventario" TO "service_role";
GRANT SELECT ON TABLE "public"."movimientos_inventario" TO "authenticated";


--
-- Name: TABLE "opciones_producto"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."opciones_producto" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."opciones_producto" TO "authenticated";


--
-- Name: COLUMN "opciones_producto"."producto_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("producto_id") ON TABLE "public"."opciones_producto" TO "authenticated";


--
-- Name: COLUMN "opciones_producto"."nombre"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("nombre"),UPDATE("nombre") ON TABLE "public"."opciones_producto" TO "authenticated";


--
-- Name: COLUMN "opciones_producto"."posicion"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("posicion"),UPDATE("posicion") ON TABLE "public"."opciones_producto" TO "authenticated";


--
-- Name: TABLE "perfiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."perfiles" TO "service_role";
GRANT SELECT ON TABLE "public"."perfiles" TO "authenticated";


--
-- Name: TABLE "productos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."productos" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."productos" TO "authenticated";


--
-- Name: COLUMN "productos"."categoria_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("categoria_id"),UPDATE("categoria_id") ON TABLE "public"."productos" TO "authenticated";


--
-- Name: COLUMN "productos"."sku"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("sku"),UPDATE("sku") ON TABLE "public"."productos" TO "authenticated";


--
-- Name: COLUMN "productos"."nombre"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("nombre"),UPDATE("nombre") ON TABLE "public"."productos" TO "authenticated";


--
-- Name: COLUMN "productos"."descripcion"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("descripcion"),UPDATE("descripcion") ON TABLE "public"."productos" TO "authenticated";


--
-- Name: COLUMN "productos"."unidad_medida"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("unidad_medida"),UPDATE("unidad_medida") ON TABLE "public"."productos" TO "authenticated";


--
-- Name: COLUMN "productos"."precio"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("precio"),UPDATE("precio") ON TABLE "public"."productos" TO "authenticated";


--
-- Name: COLUMN "productos"."stock_minimo"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("stock_minimo"),UPDATE("stock_minimo") ON TABLE "public"."productos" TO "authenticated";


--
-- Name: COLUMN "productos"."activo"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("activo"),UPDATE("activo") ON TABLE "public"."productos" TO "authenticated";


--
-- Name: COLUMN "productos"."creado_por"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("creado_por") ON TABLE "public"."productos" TO "authenticated";


--
-- Name: TABLE "valores_opcion"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."valores_opcion" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."valores_opcion" TO "authenticated";


--
-- Name: COLUMN "valores_opcion"."producto_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("producto_id") ON TABLE "public"."valores_opcion" TO "authenticated";


--
-- Name: COLUMN "valores_opcion"."opcion_id"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("opcion_id") ON TABLE "public"."valores_opcion" TO "authenticated";


--
-- Name: COLUMN "valores_opcion"."valor"; Type: ACL; Schema: public; Owner: postgres
--

GRANT INSERT("valor"),UPDATE("valor") ON TABLE "public"."valores_opcion" TO "authenticated";


--
-- Name: TABLE "ventas"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ventas" TO "service_role";
GRANT SELECT ON TABLE "public"."ventas" TO "authenticated";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict Mi4iOdD6JUksxHGBMi1jhHlTvzcaL3w3LiRYcx92Y72bOdU55libAAuuclvbY5t



-- =============================================================================
-- Descripciones legibles para el catálogo de datos
-- =============================================================================
COMMENT ON TABLE public.perfiles IS 'Perfil de cada usuario de Supabase Auth, con nombre, rol y estado de acceso.';
COMMENT ON TABLE public.empresa IS 'Datos generales, fiscales y parámetros de venta de la empresa del MVP.';
COMMENT ON TABLE public.categorias IS 'Categorías del catálogo de productos.';
COMMENT ON TABLE public.productos IS 'Productos vendibles, con precio y stock propio o con combinaciones.';
COMMENT ON TABLE public.opciones_producto IS 'Opciones que definen las dimensiones de las combinaciones de un producto.';
COMMENT ON TABLE public.valores_opcion IS 'Valores asociados a una opción de producto, como tallas o colores.';
COMMENT ON TABLE public.combinaciones IS 'Combinaciones vendibles con SKU, precio, existencias y stock mínimo.';
COMMENT ON TABLE public.clientes IS 'Clientes y sus datos de documento y contacto.';
COMMENT ON TABLE public.ventas IS 'Cabecera de venta con cliente, importes, estado y tipo de comprobante solicitado.';
COMMENT ON TABLE public.lineas_venta IS 'Detalle de venta con descripción, SKU, cantidades e importes congelados al crearla.';
COMMENT ON TABLE public.movimientos_inventario IS 'Historial de ajustes manuales y salidas de inventario por venta.';
COMMENT ON TABLE public.series_comprobante IS 'Series activas y siguiente correlativo para emitir comprobantes.';
COMMENT ON TABLE public.comprobantes IS 'Comprobantes de venta y datos de emisión o consulta al proveedor fiscal.';
COMMENT ON TABLE public.auditoria IS 'Registro de acciones relevantes y sus datos asociados.';
COMMENT ON TABLE public.conversaciones IS 'Conversaciones del asistente pertenecientes a cada usuario.';
COMMENT ON TABLE public.mensajes IS 'Mensajes de las conversaciones y referencia opcional a una venta preparada.';
COMMENT ON TABLE public.invitaciones IS 'Registro de invitaciones de usuarios y del rol asignado.';

-- Diccionario técnico: una fila por columna de cada tabla de public.
SELECT
  t.relname AS tabla,
  obj_description(t.oid, 'pg_class') AS descripcion_tabla,
  a.attname AS columna,
  format_type(a.atttypid, a.atttypmod) AS tipo_sql,
  NOT a.attnotnull AS admite_null,
  pg_get_expr(d.adbin, d.adrelid) AS valor_por_defecto,
  col_description(t.oid, a.attnum) AS descripcion_columna
FROM pg_catalog.pg_class AS t
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.relnamespace
JOIN pg_catalog.pg_attribute AS a ON a.attrelid = t.oid
LEFT JOIN pg_catalog.pg_attrdef AS d
  ON d.adrelid = t.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public'
  AND t.relkind IN ('r', 'p')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY t.relname, a.attnum;

-- Diccionario de restricciones: claves primarias/foráneas, unicidad y checks.
SELECT
  tabla.relname AS tabla,
  restriccion.conname AS nombre,
  CASE restriccion.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUSION'
  END AS tipo,
  pg_get_constraintdef(restriccion.oid, true) AS definicion
FROM pg_catalog.pg_constraint AS restriccion
JOIN pg_catalog.pg_class AS tabla ON tabla.oid = restriccion.conrelid
JOIN pg_catalog.pg_namespace AS esquema ON esquema.oid = tabla.relnamespace
WHERE esquema.nspname = 'public'
ORDER BY tabla.relname, restriccion.conname;
