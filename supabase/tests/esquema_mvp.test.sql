begin;
select plan(15);

select has_table('public', 'perfiles', 'existe la tabla de perfiles');
select has_table('public', 'empresa', 'existe la configuración única de empresa');
select has_table('public', 'categorias', 'existen categorías');
select has_table('public', 'productos', 'existe el catálogo de productos');
select has_table('public', 'opciones_producto', 'existen ejes de opciones');
select has_table('public', 'valores_opcion', 'existen valores de opciones');
select has_table('public', 'combinaciones', 'existen combinaciones vendibles');
select has_table('public', 'clientes', 'existen clientes');
select has_table('public', 'ventas', 'existen ventas');
select has_table('public', 'lineas_venta', 'existen líneas de venta');
select has_table('public', 'movimientos_inventario', 'existe el libro de inventario');
select has_table('public', 'series_comprobante', 'existen series fiscales');
select has_table('public', 'comprobantes', 'existen comprobantes');
select has_table('public', 'auditoria', 'existe auditoría operativa');
select has_column('public', 'ventas', 'total', 'las ventas persisten el total calculado');

select * from finish();
rollback;
