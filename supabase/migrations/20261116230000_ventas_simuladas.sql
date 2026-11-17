-- Las ventas pueden venir del uso del sistema o del historial simulado del dataset APF3.
-- Las simuladas se rotulan para no presentarlas como reales y nunca generan comprobantes.
alter table public.ventas
  add column origen text not null default 'registrada'
    check (origen in ('registrada', 'simulada'));

comment on column public.ventas.origen is
  'registrada: venta hecha en el sistema; simulada: historial del dataset APF3, sin comprobante.';

create or replace function private.impedir_comprobante_venta_simulada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from public.ventas v
    where v.id = new.venta_id and v.origen = 'simulada'
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'comprobantes_venta_no_simulada',
      message = 'Las ventas simuladas no emiten comprobantes.';
  end if;
  return new;
end;
$function$;

revoke all on function private.impedir_comprobante_venta_simulada()
  from public, anon, authenticated;

create trigger comprobantes_venta_no_simulada
  before insert or update of venta_id on public.comprobantes
  for each row
  execute function private.impedir_comprobante_venta_simulada();
