create extension if not exists pgcrypto with schema extensions;

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),
  rol text not null default 'vendedor' check (rol in ('administrador', 'vendedor')),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.empresa (
  unica boolean primary key default true check (unica),
  nombre text not null check (length(trim(nombre)) > 0),
  ruc text check (ruc is null or ruc ~ '^[0-9]{11}$'),
  direccion text,
  telefono text,
  correo text,
  moneda text not null default 'PEN' check (moneda in ('PEN', 'USD')),
  igv_activo boolean not null default true,
  igv_porcentaje numeric(5, 2) not null default 18 check (igv_porcentaje >= 0 and igv_porcentaje <= 100),
  precios_incluyen_igv boolean not null default true,
  actualizado_por uuid references public.perfiles (id) on delete set null,
  actualizado_en timestamptz not null default now()
);

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (nombre)
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid references public.categorias (id) on delete set null,
  sku text not null unique check (length(trim(sku)) > 0),
  nombre text not null check (length(trim(nombre)) > 0),
  descripcion text,
  unidad_medida text not null default 'NIU' check (length(trim(unidad_medida)) > 0),
  usa_combinaciones boolean not null default false,
  precio numeric(12, 2) check (precio is null or precio >= 0),
  existencias numeric(12, 3) not null default 0,
  stock_minimo numeric(12, 3) not null default 0 check (stock_minimo >= 0),
  activo boolean not null default true,
  creado_por uuid not null references public.perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (usa_combinaciones or precio is not null),
  check (not usa_combinaciones or precio is null)
);

create table public.opciones_producto (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  posicion smallint not null check (posicion in (1, 2)),
  unique (producto_id, posicion),
  unique (producto_id, id)
);

create table public.valores_opcion (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete cascade,
  opcion_id uuid not null,
  valor text not null check (length(trim(valor)) > 0),
  unique (opcion_id, valor),
  unique (producto_id, id),
  foreign key (producto_id, opcion_id) references public.opciones_producto (producto_id, id) on delete cascade
);

create table public.combinaciones (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete cascade,
  valor_opcion_1_id uuid,
  valor_opcion_2_id uuid,
  sku text not null unique check (length(trim(sku)) > 0),
  precio numeric(12, 2) not null check (precio >= 0),
  existencias numeric(12, 3) not null default 0,
  stock_minimo numeric(12, 3) not null default 0 check (stock_minimo >= 0),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  check (valor_opcion_1_id is not null or valor_opcion_2_id is not null),
  unique nulls not distinct (producto_id, valor_opcion_1_id, valor_opcion_2_id),
  unique (producto_id, id),
  foreign key (producto_id, valor_opcion_1_id) references public.valores_opcion (producto_id, id) on delete restrict,
  foreign key (producto_id, valor_opcion_2_id) references public.valores_opcion (producto_id, id) on delete restrict
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  tipo_documento text not null default 'sin_documento' check (tipo_documento in ('sin_documento', 'dni', 'ruc', 'ce', 'pasaporte')),
  numero_documento text,
  nombre text not null check (length(trim(nombre)) > 0),
  direccion text,
  telefono text,
  correo text,
  notas text,
  activo boolean not null default true,
  creado_por uuid not null references public.perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check ((tipo_documento = 'sin_documento') or length(trim(coalesce(numero_documento, ''))) > 0)
);

create table public.ventas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes (id) on delete set null,
  cliente_nombre text,
  cliente_tipo_documento text,
  cliente_numero_documento text,
  cliente_direccion text,
  estado text not null default 'borrador' check (estado in ('borrador', 'confirmada', 'descartada')),
  moneda text not null default 'PEN' check (moneda in ('PEN', 'USD')),
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  igv numeric(12, 2) not null default 0 check (igv >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  nota text,
  creado_por uuid not null references public.perfiles (id) on delete restrict,
  confirmado_por uuid references public.perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),
  confirmado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  check ((estado = 'confirmada') = (confirmado_en is not null))
);

create table public.lineas_venta (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas (id) on delete cascade,
  producto_id uuid not null references public.productos (id) on delete restrict,
  combinacion_id uuid,
  descripcion_congelada text not null check (length(trim(descripcion_congelada)) > 0),
  sku_congelado text not null,
  unidad_medida text not null,
  cantidad numeric(12, 3) not null check (cantidad > 0),
  precio_unitario numeric(12, 2) not null check (precio_unitario >= 0),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  igv numeric(12, 2) not null check (igv >= 0),
  total numeric(12, 2) not null check (total >= 0),
  creado_en timestamptz not null default now(),
  foreign key (producto_id, combinacion_id) references public.combinaciones (producto_id, id) on delete restrict
);

create table public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete restrict,
  combinacion_id uuid,
  tipo text not null check (tipo in ('ajuste', 'venta')),
  cantidad numeric(12, 3) not null check (cantidad <> 0),
  existencias_resultantes numeric(12, 3) not null,
  motivo text not null check (length(trim(motivo)) > 0),
  venta_id uuid references public.ventas (id) on delete restrict,
  usuario_id uuid not null references public.perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),
  foreign key (producto_id, combinacion_id) references public.combinaciones (producto_id, id) on delete restrict,
  check ((tipo = 'venta') = (venta_id is not null))
);

create table public.series_comprobante (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('boleta', 'factura')),
  serie text not null check (serie ~ '^[BF][A-Z0-9]{3}$'),
  siguiente_numero bigint not null default 1 check (siguiente_numero > 0),
  activa boolean not null default true,
  actualizado_por uuid references public.perfiles (id) on delete set null,
  actualizado_en timestamptz not null default now(),
  unique (tipo, serie)
);

create unique index series_comprobante_una_activa_por_tipo
  on public.series_comprobante (tipo) where activa;

create table public.comprobantes (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null unique references public.ventas (id) on delete restrict,
  tipo text not null check (tipo in ('boleta', 'factura')),
  serie text not null,
  numero bigint not null check (numero > 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'emitido', 'rechazado', 'error')),
  payload jsonb not null,
  respuesta_proveedor jsonb,
  enlace_pdf text,
  enlace_xml text,
  enlace_cdr text,
  cadena_qr text,
  intentos smallint not null default 0 check (intentos >= 0),
  error_publico text,
  solicitado_por uuid not null references public.perfiles (id) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (serie, numero)
);

create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.perfiles (id) on delete set null,
  accion text not null check (length(trim(accion)) > 0),
  entidad text not null check (length(trim(entidad)) > 0),
  entidad_id uuid,
  datos jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);

create index opciones_producto_producto_idx on public.opciones_producto (producto_id);
create index valores_opcion_producto_idx on public.valores_opcion (producto_id);
create index combinaciones_producto_idx on public.combinaciones (producto_id);
create index productos_categoria_idx on public.productos (categoria_id);
create index clientes_nombre_idx on public.clientes (nombre);
create index ventas_creado_por_fecha_idx on public.ventas (creado_por, creado_en desc);
create index ventas_estado_fecha_idx on public.ventas (estado, creado_en desc);
create index lineas_venta_venta_idx on public.lineas_venta (venta_id);
create index lineas_venta_producto_idx on public.lineas_venta (producto_id);
create index movimientos_producto_fecha_idx on public.movimientos_inventario (producto_id, creado_en desc);
create index movimientos_combinacion_fecha_idx on public.movimientos_inventario (combinacion_id, creado_en desc) where combinacion_id is not null;
create index comprobantes_estado_fecha_idx on public.comprobantes (estado, creado_en desc);
create index auditoria_entidad_idx on public.auditoria (entidad, entidad_id, creado_en desc);

alter table public.perfiles enable row level security;
alter table public.empresa enable row level security;
alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.opciones_producto enable row level security;
alter table public.valores_opcion enable row level security;
alter table public.combinaciones enable row level security;
alter table public.clientes enable row level security;
alter table public.ventas enable row level security;
alter table public.lineas_venta enable row level security;
alter table public.movimientos_inventario enable row level security;
alter table public.series_comprobante enable row level security;
alter table public.comprobantes enable row level security;
alter table public.auditoria enable row level security;
