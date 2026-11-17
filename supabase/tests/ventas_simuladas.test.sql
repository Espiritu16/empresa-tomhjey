begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000094', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendedor-simulado@test.local', '', now(), '{"nombre":"Vendedor simulado"}', now(), now());

select col_default_is('public', 'ventas', 'origen', 'registrada'::text, 'las ventas nuevas se registran como reales');

insert into public.ventas (id, estado, total, creado_por, confirmado_por, confirmado_en, tipo_comprobante, origen)
values
  ('12000000-0000-4000-8000-000000000001', 'confirmada', 64.6, '11000000-0000-4000-8000-000000000094', '11000000-0000-4000-8000-000000000094', now(), 'boleta', 'simulada'),
  ('12000000-0000-4000-8000-000000000002', 'confirmada', 64.6, '11000000-0000-4000-8000-000000000094', '11000000-0000-4000-8000-000000000094', now(), 'boleta', 'registrada');

select throws_ok(
  $$insert into public.ventas (estado, creado_por, origen)
    values ('borrador', '11000000-0000-4000-8000-000000000094', 'inventada')$$,
  '23514', null, 'origen solo acepta registrada o simulada'
);

select throws_ok(
  $$insert into public.comprobantes (venta_id, tipo, serie, numero, payload, solicitado_por)
    values ('12000000-0000-4000-8000-000000000001', 'boleta', 'BTST', 1, '{}', '11000000-0000-4000-8000-000000000094')$$,
  '23514', 'Las ventas simuladas no emiten comprobantes.', 'una venta simulada no genera comprobante'
);

select lives_ok(
  $$insert into public.comprobantes (venta_id, tipo, serie, numero, payload, solicitado_por)
    values ('12000000-0000-4000-8000-000000000002', 'boleta', 'BTST', 2, '{}', '11000000-0000-4000-8000-000000000094')$$,
  'una venta registrada sí genera comprobante'
);

select * from finish();
rollback;
