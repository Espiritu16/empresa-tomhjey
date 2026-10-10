create or replace function private.validar_documento_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function private.validar_documento_cliente() from public, anon, authenticated;

create trigger clientes_validar_documento
  before insert or update on public.clientes
  for each row execute function private.validar_documento_cliente();
