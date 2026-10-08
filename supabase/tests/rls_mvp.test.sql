begin;
select plan(18);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local', '', now(), '{"nombre":"Admin"}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seller@test.local', '', now(), '{"nombre":"Vendedor"}', now(), now());
update public.perfiles set rol = 'administrador' where id = '10000000-0000-4000-8000-000000000001';
insert into public.empresa (nombre) values ('Empresa de pruebas');
insert into public.categorias (id, nombre) values ('20000000-0000-4000-8000-000000000001', 'Pruebas');
insert into public.productos (id, categoria_id, sku, nombre, precio, creado_por)
values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'TEST-001', 'Producto prueba', 10, '10000000-0000-4000-8000-000000000001');
insert into public.ventas (id, estado, total, creado_por, confirmado_por, confirmado_en)
values
  ('40000000-0000-4000-8000-000000000001', 'confirmada', 10, '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', now()),
  ('40000000-0000-4000-8000-000000000002', 'confirmada', 10, '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now());
insert into public.conversaciones (id, usuario_id) values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');
insert into public.mensajes (conversacion_id, rol, contenido)
values ('50000000-0000-4000-8000-000000000001', 'asistente', 'Respuesta de prueba');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*) from public.ventas), 1::bigint, 'el vendedor solo ve sus ventas');
select is((public.asistente_resumen_ventas(now() - interval '1 day', now() + interval '1 day') ->> 'cantidad'), '1', 'el asistente resume solo las ventas del vendedor');
select is((public.resumen_inicio(now() - interval '1 day', now() + interval '1 day') ->> 'total_ventas'), '10.00', 'el inicio calcula solo el total visible al vendedor');
select is((select count(*) from public.productos), 1::bigint, 'el vendedor puede consultar catálogo');
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
select is((select count(*) from public.ventas), 2::bigint, 'el administrador ve todas las ventas');
select is((public.asistente_resumen_ventas(now() - interval '1 day', now() + interval '1 day') ->> 'cantidad'), '2', 'el asistente resume todas las ventas para administración');
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
select is((select count(*) from public.auditoria), 0::bigint, 'auditoría no se expone para escritura directa');

select * from finish();
rollback;
