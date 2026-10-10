begin;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local', '', now(), '{"nombre":"Admin"}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seller@test.local', '', now(), '{"nombre":"Vendedor"}', now(), now());
update public.perfiles set rol = 'administrador' where id = '10000000-0000-4000-8000-000000000001';
insert into public.empresa (unica, nombre)
values (true, 'Empresa de pruebas')
on conflict (unica) do update set nombre = excluded.nombre;
insert into public.categorias (id, nombre) values ('20000000-0000-4000-8000-000000000001', 'Pruebas');
insert into public.productos (id, categoria_id, sku, nombre, precio, creado_por)
values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'TEST-001', 'Producto prueba', 10, '10000000-0000-4000-8000-000000000001');
insert into public.clientes (id, nombre, creado_por)
values ('32000000-0000-4000-8000-000000000001', 'Cliente RLS', '10000000-0000-4000-8000-000000000001');
insert into public.ventas (id, cliente_id, cliente_nombre, estado, total, creado_por, confirmado_por, confirmado_en)
values
  ('40000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001', 'Cliente RLS', 'confirmada', 10, '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '2999-01-01 00:00:00+00'),
  ('40000000-0000-4000-8000-000000000002', '32000000-0000-4000-8000-000000000001', 'Cliente RLS', 'confirmada', 10, '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00');
insert into public.conversaciones (id, usuario_id) values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');
insert into public.mensajes (conversacion_id, rol, contenido)
values ('50000000-0000-4000-8000-000000000001', 'asistente', 'Respuesta de prueba');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*) from public.ventas where id in (
  '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002'
)), 1::bigint, 'el vendedor solo ve sus ventas de prueba');
select is((public.asistente_resumen_ventas('2999-01-01 00:00:00+00', '2999-01-02 00:00:00+00') ->> 'cantidad'), '1', 'el asistente resume solo las ventas del vendedor');
select is((public.resumen_inicio('2999-01-01 00:00:00+00', '2999-01-02 00:00:00+00') ->> 'total_ventas'), '10.00', 'el inicio calcula solo el total visible al vendedor');
select is((select count(*) from public.productos where id = '30000000-0000-4000-8000-000000000001'), 1::bigint, 'el vendedor puede consultar catálogo');
select is((select count(*) from public.perfiles where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')), 1::bigint, 'el vendedor solo ve su propio perfil');
select is((select count(*) from public.conversaciones), 1::bigint, 'el vendedor solo ve sus conversaciones');
select is((select count(*) from public.mensajes), 1::bigint, 'el vendedor solo ve los mensajes de su conversación');
select lives_ok(
  $$insert into public.mensajes (conversacion_id, rol, contenido)
    values ('50000000-0000-4000-8000-000000000001', 'usuario', 'Consulta de prueba')$$,
  'el vendedor puede guardar sus mensajes'
);
select throws_ok(
  $$insert into public.mensajes (conversacion_id, rol, contenido)
    values ('50000000-0000-4000-8000-000000000001', 'asistente', 'Mensaje falsificado')$$,
  '42501', null, 'el vendedor no puede insertar respuestas del asistente'
);
select throws_ok(
  $$insert into public.categorias (nombre) values ('No permitido')$$,
  '42501', null, 'el vendedor no puede crear categorías'
);
select throws_ok(
  $$insert into public.movimientos_inventario (producto_id, tipo, cantidad, existencias_resultantes, motivo, usuario_id)
    values ('30000000-0000-4000-8000-000000000001', 'ajuste', 1, 1, 'prueba', '10000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'el vendedor no puede insertar movimientos directos'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.ventas where id in (
  '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002'
)), 2::bigint, 'el administrador ve todas las ventas de prueba');
select is((public.asistente_resumen_ventas('2999-01-01 00:00:00+00', '2999-01-02 00:00:00+00') ->> 'cantidad'), '2', 'el asistente resume todas las ventas para administración');
select is((select count(*) from public.perfiles where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')), 2::bigint, 'el administrador puede consultar el equipo de pruebas');
select lives_ok(
  $$insert into public.categorias (nombre) values ('Categoría admin')$$,
  'el administrador puede crear categorías'
);
select throws_ok(
  $$update public.perfiles set rol = 'administrador' where id = '10000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'el administrador no cambia roles directamente'
);
select throws_ok(
  $$update public.productos set existencias = 999 where id = '30000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'el administrador tampoco cambia stock sin registrar un movimiento'
);
select is((select count(*) from public.auditoria where usuario_id in (
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'
)), 0::bigint, 'auditoría no se expone para escritura directa');

select * from finish();
rollback;
