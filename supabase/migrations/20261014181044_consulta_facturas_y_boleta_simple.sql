-- Un borrador puede nacer sin cliente para que la RPC que conoce el tipo y el
-- total complete su validación dentro de la misma transacción. Al confirmar la
-- transacción, solo quedan ventas sin cliente si son boletas bajo S/ 700.
alter table public.ventas
  drop constraint ventas_cliente_obligatorio;

create or replace function private.validar_cliente_venta_diferida()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  venta_final public.ventas%rowtype;
begin
  select * into venta_final
  from public.ventas
  where id = new.id;

  if not found then
    return null;
  end if;

  -- No romper ventas históricas sin cliente cuando solo cambia otro dato.
  if tg_op = 'UPDATE'
    and old.cliente_id is null
    and old.estado <> 'descartada'
    and (old.tipo_comprobante is distinct from 'boleta' or old.total >= 700)
    and old.cliente_id is not distinct from new.cliente_id
    and old.estado is not distinct from new.estado
    and old.tipo_comprobante is not distinct from new.tipo_comprobante
    and old.total is not distinct from new.total then
    return null;
  end if;

  if venta_final.cliente_id is null
    and venta_final.estado <> 'descartada'
    and (
      venta_final.tipo_comprobante is distinct from 'boleta'
      or venta_final.total >= 700
    ) then
    raise exception using
      errcode = '23514',
      constraint = 'ventas_cliente_obligatorio',
      message = 'Solo se permite una boleta simple sin cliente por menos de S/ 700.';
  end if;

  return null;
end;
$function$;

revoke all on function private.validar_cliente_venta_diferida()
  from public, anon, authenticated;

create constraint trigger ventas_cliente_obligatorio
  after insert or update on public.ventas
  deferrable initially deferred
  for each row
  execute function private.validar_cliente_venta_diferida();

create or replace function public.crear_borrador_venta_con_comprobante(
  cliente_objetivo uuid,
  lineas jsonb,
  tipo_comprobante_solicitado text,
  venta_objetivo uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  venta_id uuid;
  venta_actual public.ventas%rowtype;
begin
  if tipo_comprobante_solicitado not in ('factura', 'boleta') then
    raise exception using errcode = '22023', message = 'Selecciona factura o boleta.';
  end if;
  if tipo_comprobante_solicitado = 'factura' and cliente_objetivo is null then
    raise exception using errcode = '22023', message = 'La factura requiere un cliente con RUC válido.';
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
    and venta_actual.total >= 700
    and nullif(venta_actual.cliente_numero_documento, '') is null then
    raise exception using errcode = '22023', message = 'Las boletas desde S/ 700 requieren identificar al cliente.';
  end if;

  update public.ventas
  set tipo_comprobante = tipo_comprobante_solicitado,
      actualizado_en = now()
  where id = venta_id;

  return venta_id;
end;
$function$;

revoke all on function public.crear_borrador_venta_con_comprobante(uuid, jsonb, text, uuid)
  from public, anon;
grant execute on function public.crear_borrador_venta_con_comprobante(uuid, jsonb, text, uuid)
  to authenticated;

-- La escritura base solo debe poder invocarse desde la RPC que valida el tipo y
-- el total final de la venta.
revoke all on function public.crear_borrador_venta(uuid, jsonb, uuid)
  from public, anon, authenticated;

-- «Varios» usa el tipo fiscal «-» y los campos técnicos exigidos por NubeFacT.
do $migration$
declare
  definicion text;
  definicion_actualizada text;
begin
  definicion := pg_get_functiondef(
    'public.reservar_comprobante(uuid,uuid,text)'::regprocedure
  );
  definicion_actualizada := replace(
    definicion,
    $anterior$
  mapa_documento := case venta_actual.cliente_tipo_documento
    when 'dni' then '1' when 'ce' then '4' when 'ruc' then '6'
    when 'pasaporte' then '7' when 'sin_documento' then '-' else '0' end;
$anterior$,
    $nuevo$
  mapa_documento := case
    when venta_actual.cliente_id is null
      or venta_actual.cliente_tipo_documento = 'sin_documento' then '-'
    when venta_actual.cliente_tipo_documento = 'dni' then '1'
    when venta_actual.cliente_tipo_documento = 'ce' then '4'
    when venta_actual.cliente_tipo_documento = 'ruc' then '6'
    when venta_actual.cliente_tipo_documento = 'pasaporte' then '7'
    else '0'
  end;
$nuevo$
  );

  if definicion_actualizada = definicion
    or position('when venta_actual.cliente_id is null' in definicion_actualizada) = 0 then
    raise exception 'No se pudo adaptar el payload de NubeFacT para una boleta sin cliente.';
  end if;

  execute definicion_actualizada;
end;
$migration$;

create or replace function public.reservar_consulta_factura(
  administrador_objetivo uuid,
  comprobante_objetivo uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  comprobante_actual public.comprobantes%rowtype;
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = administrador_objetivo
      and p.rol = 'administrador'
      and p.activo
  ) then
    raise exception using errcode = '42501', message = 'Solo administración puede consultar facturas.';
  end if;

  select * into comprobante_actual
  from public.comprobantes
  where id = comprobante_objetivo
  for update;
  if not found
    or comprobante_actual.tipo <> 'factura'
    or comprobante_actual.estado <> 'emitido' then
    raise exception using errcode = '22023', message = 'Solo se consulta una factura ya emitida.';
  end if;
  if comprobante_actual.respuesta_consulta_sunat ->> 'aceptada_por_sunat' = 'true'
    or comprobante_actual.respuesta_proveedor ->> 'aceptada_por_sunat' = 'true' then
    raise exception using errcode = '22023', message = 'La factura ya figura aceptada por SUNAT.';
  end if;
  if comprobante_actual.consultado_sunat_en > now() - interval '1 minute' then
    raise exception using errcode = '22023', message = 'La factura ya se consultó hace menos de un minuto.';
  end if;
  if comprobante_actual.consulta_en_proceso_hasta > now() then
    raise exception using errcode = '55P03', message = 'Ya hay una consulta en proceso para esta factura.';
  end if;

  update public.comprobantes
  set consulta_en_proceso_hasta = now() + interval '2 minutes'
  where id = comprobante_objetivo;

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (
    administrador_objetivo,
    'reservar_consulta_factura',
    'comprobante',
    comprobante_objetivo,
    jsonb_build_object('tipo', 'factura')
  );

  return jsonb_build_object(
    'comprobante_id', comprobante_actual.id,
    'serie', comprobante_actual.serie,
    'numero', comprobante_actual.numero,
    'payload', comprobante_actual.payload
  );
end;
$function$;

create or replace function public.registrar_consulta_factura(
  administrador_objetivo uuid,
  comprobante_objetivo uuid,
  respuesta jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = administrador_objetivo
      and p.rol = 'administrador'
      and p.activo
  ) then
    raise exception using errcode = '42501', message = 'Solo administración puede guardar consultas de facturas.';
  end if;
  if respuesta is not null and jsonb_typeof(respuesta) <> 'object' then
    raise exception using errcode = '22023', message = 'La respuesta de consulta no es válida.';
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
  where id = comprobante_objetivo
    and tipo = 'factura'
    and estado = 'emitido'
    and consulta_en_proceso_hasta > now();
  if not found then
    raise exception using errcode = 'P0002', message = 'La consulta de la factura ya no está reservada.';
  end if;

  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (
    administrador_objetivo,
    'registrar_consulta_factura',
    'comprobante',
    comprobante_objetivo,
    jsonb_build_object(
      'encontrada', respuesta is not null,
      'aceptada_por_sunat', coalesce(respuesta ->> 'aceptada_por_sunat' = 'true', false)
    )
  );
end;
$function$;

revoke all on function public.reservar_consulta_factura(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.registrar_consulta_factura(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.reservar_consulta_factura(uuid, uuid)
  to service_role;
grant execute on function public.registrar_consulta_factura(uuid, uuid, jsonb)
  to service_role;
