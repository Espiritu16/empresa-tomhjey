do $migration$
begin
  if exists (
    select 1
    from public.clientes
    where tipo_documento in ('dni', 'ruc')
      and numero_documento is not null
    group by tipo_documento, numero_documento
    having count(*) > 1
  ) then
    raise exception 'Hay DNI o RUC repetidos en clientes; resuélvelos antes de crear el índice único.';
  end if;
end;
$migration$;

create unique index clientes_documento_identificado_unico_idx
  on public.clientes (tipo_documento, numero_documento)
  where tipo_documento in ('dni', 'ruc') and numero_documento is not null;

create or replace function public.crear_borrador_venta_con_documento(
  tipo_documento_cliente text,
  numero_documento_cliente text,
  nombre_cliente text,
  direccion_cliente text,
  lineas jsonb,
  tipo_comprobante_solicitado text,
  venta_objetivo uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  usuario_actual uuid := (select auth.uid());
  cliente_id uuid;
  documento text := trim(coalesce(numero_documento_cliente, ''));
  nombre text := trim(coalesce(nombre_cliente, ''));
  suma integer := 0;
  resto integer;
  digito integer;
  factores integer[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
begin
  if not (select private.tiene_rol(array['administrador', 'vendedor'])) then
    raise exception using errcode = '42501', message = 'La sesión no puede crear ventas.';
  end if;

  if tipo_comprobante_solicitado is null
    or tipo_comprobante_solicitado not in ('boleta', 'factura') then
    raise exception using errcode = '22023', message = 'Selecciona boleta o factura.';
  end if;

  if nombre = '' then
    raise exception using errcode = '22023', message = 'Consulta el documento en SUNAT antes de guardar la venta.';
  end if;

  if tipo_comprobante_solicitado = 'boleta' then
    if tipo_documento_cliente is distinct from 'dni'
      or documento !~ '^[0-9]{8}$' then
      raise exception using errcode = '22023', message = 'La boleta requiere un DNI de ocho dígitos.';
    end if;
  elsif tipo_documento_cliente is distinct from 'ruc'
    or documento !~ '^[0-9]{11}$'
    or substring(documento from 1 for 2) not in ('10', '20') then
    raise exception using errcode = '22023', message = 'La factura requiere un RUC válido que empiece por 10 o 20.';
  else
    for indice in 1..10 loop
      suma := suma + substring(documento from indice for 1)::integer * factores[indice];
    end loop;
    resto := 11 - (suma % 11);
    digito := case resto when 10 then 0 when 11 then 1 else resto end;
    if digito <> substring(documento from 11 for 1)::integer then
      raise exception using errcode = '22023', message = 'Escribe un RUC válido de once dígitos.';
    end if;
  end if;

  select c.id into cliente_id
  from public.clientes c
  where c.tipo_documento = tipo_documento_cliente
    and c.numero_documento = documento
    and c.activo
  for update;

  if cliente_id is null then
    if exists (
      select 1 from public.clientes c
      where c.tipo_documento = tipo_documento_cliente
        and c.numero_documento = documento
    ) then
      raise exception using errcode = '22023', message = 'El documento pertenece a un cliente inactivo. Actívalo desde Clientes antes de vender.';
    end if;

    insert into public.clientes (
      tipo_documento, numero_documento, nombre, direccion, creado_por
    ) values (
      tipo_documento_cliente, documento, nombre,
      nullif(trim(coalesce(direccion_cliente, '')), ''), usuario_actual
    )
    on conflict (tipo_documento, numero_documento)
      where tipo_documento in ('dni', 'ruc') and numero_documento is not null
      do nothing
    returning id into cliente_id;

    if cliente_id is null then
      select c.id into cliente_id
      from public.clientes c
      where c.tipo_documento = tipo_documento_cliente
        and c.numero_documento = documento
        and c.activo
      for update;

      if cliente_id is null then
        raise exception using errcode = '22023', message = 'El documento pertenece a un cliente inactivo. Actívalo desde Clientes antes de vender.';
      end if;
    end if;
  end if;

  return public.crear_borrador_venta_con_comprobante(
    cliente_id,
    lineas,
    tipo_comprobante_solicitado,
    venta_objetivo
  );
end;
$function$;

revoke all on function public.crear_borrador_venta_con_documento(text, text, text, text, jsonb, text, uuid)
  from public, anon;
grant execute on function public.crear_borrador_venta_con_documento(text, text, text, text, jsonb, text, uuid)
  to authenticated;

create or replace function private.validar_documento_comprobante_venta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.estado <> 'descartada' and new.tipo_comprobante = 'boleta'
    and new.cliente_id is not null
    and (new.cliente_tipo_documento is distinct from 'dni'
      or new.cliente_numero_documento !~ '^[0-9]{8}$') then
    raise exception using
      errcode = '23514',
      constraint = 'ventas_boleta_requiere_dni',
      message = 'La boleta requiere un cliente identificado con DNI de ocho dígitos.';
  end if;

  if new.estado <> 'descartada' and new.tipo_comprobante = 'factura'
    and (new.cliente_tipo_documento is distinct from 'ruc'
      or not private.ruc_valido(new.cliente_numero_documento)
      or substring(new.cliente_numero_documento from 1 for 2) not in ('10', '20')) then
    raise exception using
      errcode = '23514',
      constraint = 'ventas_factura_requiere_ruc_10_20',
      message = 'La factura requiere un RUC válido que empiece por 10 o 20.';
  end if;

  return null;
end;
$function$;

revoke all on function private.validar_documento_comprobante_venta()
  from public, anon, authenticated;

create constraint trigger ventas_validar_documento_comprobante
  after insert or update on public.ventas
  deferrable initially deferred
  for each row
  execute function private.validar_documento_comprobante_venta();
