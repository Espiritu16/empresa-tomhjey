-- Las consultas de comprobantes pendientes pueden repetirse a solicitud del usuario.
-- Se conserva el lease para bloquear únicamente solicitudes simultáneas.
create or replace function public.reservar_consulta_boleta(
  administrador_objetivo uuid,
  comprobante_objetivo uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  comprobante_actual public.comprobantes%rowtype;
begin
  if not exists (
    select 1 from public.perfiles p
    where p.id = administrador_objetivo
      and p.rol = 'administrador'
      and p.activo
  ) then
    raise exception using errcode = '42501', message = 'La cuenta administradora no está activa.';
  end if;

  select * into comprobante_actual
  from public.comprobantes
  where id = comprobante_objetivo
  for update;
  if not found
    or comprobante_actual.tipo <> 'boleta'
    or comprobante_actual.estado <> 'emitido' then
    raise exception using errcode = '22023', message = 'Solo se consulta una boleta ya emitida.';
  end if;
  if comprobante_actual.respuesta_consulta_sunat ->> 'aceptada_por_sunat' = 'true'
    or comprobante_actual.respuesta_proveedor ->> 'aceptada_por_sunat' = 'true' then
    raise exception using errcode = '22023', message = 'La boleta ya figura aceptada por SUNAT.';
  end if;
  if comprobante_actual.consulta_en_proceso_hasta > now() then
    raise exception using errcode = '55P03', message = 'Ya hay una consulta en proceso para esta boleta.';
  end if;

  update public.comprobantes
  set consulta_en_proceso_hasta = now() + interval '2 minutes'
  where id = comprobante_objetivo;
  insert into public.auditoria (usuario_id, accion, entidad, entidad_id, datos)
  values (
    administrador_objetivo,
    'reservar_consulta_boleta',
    'comprobante',
    comprobante_objetivo,
    '{}'::jsonb
  );

  return jsonb_build_object(
    'comprobante_id', comprobante_actual.id,
    'serie', comprobante_actual.serie,
    'numero', comprobante_actual.numero,
    'payload', comprobante_actual.payload
  );
end;
$$;

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

revoke all on function public.reservar_consulta_boleta(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reservar_consulta_boleta(uuid, uuid)
  to service_role;
revoke all on function public.reservar_consulta_factura(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reservar_consulta_factura(uuid, uuid)
  to service_role;
