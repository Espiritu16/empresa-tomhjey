create or replace function private.validar_cambio_estado_cliente()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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

revoke all on function private.validar_cambio_estado_cliente() from public, anon, authenticated;

create trigger validar_estado_cliente
  before update of activo on public.clientes
  for each row execute function private.validar_cambio_estado_cliente();

create or replace function public.cambiar_estado_cliente(cliente_objetivo uuid, activar boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
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

revoke all on function public.cambiar_estado_cliente(uuid, boolean) from public, anon;
grant execute on function public.cambiar_estado_cliente(uuid, boolean) to authenticated;
