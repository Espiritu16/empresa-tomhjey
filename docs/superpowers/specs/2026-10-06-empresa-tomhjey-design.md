# Empresa Tomhjey — spec técnico de backend y frontend

**Estado:** aprobada para implementación por el usuario el 2026-10-07
**Fecha:** 2026-10-06  
**Base funcional:** [alcance-mvp.md](../../alcance-mvp.md)  
**Proyecto de referencia:** Trayecto, sistema de ventas e inventario para empresas textiles

## 1. Propósito

Definir la arquitectura del MVP de Empresa Tomhjey para implementar ventas,
inventario, clientes y facturación electrónica con asistencia de IA. La
aplicación sirve a una sola empresa y a su equipo. No administra suscripciones
ni otras empresas como clientes de un SaaS.

El frontend usa Next.js y TypeScript. Supabase proporciona autenticación,
Postgres, políticas de acceso y funciones de backend. NubeFacT y el proveedor
de IA se integran desde el servidor.

El alcance funcional permanece en docs/alcance-mvp.md. Este documento concreta
cómo se conectan esas funciones; no agrega compras, pagos en línea, sucursales,
planes, catálogo público ni administración SaaS.

## 2. Decisiones de diseño

### 2.1 Arquitectura recomendada

Se elige un backend centrado en Supabase:

- **Postgres** es la fuente de verdad para productos, existencias, clientes,
  ventas, comprobantes, roles y conversaciones del asistente.
- **Row Level Security (RLS)** aplica los permisos en la base de datos para
  todas las tablas accesibles por la aplicación.
- **Funciones SQL transaccionales** aplican operaciones que deben cambiar
  varias filas de forma atómica, como confirmar una venta, descontar existencias
  y registrar el movimiento asociado.
- **Supabase Edge Functions** ejecutan llamadas que necesitan secretos o
  proveedores externos: NubeFacT y el modelo de IA. Las funciones verifican la
  sesión y el rol antes de ejecutar cada operación.
- **Next.js** presenta la aplicación, resuelve la navegación, carga datos
  autenticados y llama a consultas, funciones SQL y Edge Functions. No mantiene
  una segunda implementación de las reglas de negocio.

Este enfoque mantiene el esquema y sus reglas junto a los datos, aprovecha RLS
como frontera de autorización y reserva las Edge Functions para los servicios
externos. Las operaciones fiscales y de IA no se llaman directamente desde el
navegador.

### 2.2 Una sola empresa

Cada entorno de la aplicación corresponde a Empresa Tomhjey. No hay selector de
empresa, identificador de inquilino en cada registro, invitaciones entre
empresas ni tablas de planes o suscripciones. La configuración fiscal y
comercial se guarda en un registro único de empresa.

Las tablas de negocio relacionan sus registros entre sí, pero no incluyen
empresa_id como una capa de multi-tenant que la aplicación no necesita. RLS
limita el acceso a usuarios autenticados y activos de este proyecto, y añade
las reglas de rol donde corresponda. Si el producto se convierte más adelante
en un SaaS multiempresa, esa decisión requerirá otro diseño de aislamiento y
migración.

### 2.3 Autenticación y roles

Supabase Auth gestiona las cuentas y sesiones. El MVP tiene dos roles:

- **Administrador:** gestiona el equipo, la configuración comercial y fiscal,
  productos, ajustes de inventario, ventas, comprobantes y reportes generales.
- **Vendedor:** consulta el catálogo y las existencias, registra ventas y usa el
  asistente. No administra usuarios, configuración fiscal ni ajustes de stock.

La tabla de perfiles guarda el identificador de Auth, el rol y el estado activo.
El rol se establece desde una operación autorizada del servidor; no se confía
en user_metadata ni en datos de rol enviados por el navegador. Las políticas
RLS y las funciones que cambian datos verifican la identidad y el rol en el
servidor o en Postgres. Las guardas de Next.js solo mejoran la navegación y no
son una barrera de seguridad.

El primer administrador se aprovisiona para el entorno de la empresa. A partir
de ahí, el administrador invita a vendedores desde el módulo de usuarios. No
hay registro público ni selección de plan. Desactivar una cuenta revoca su
acceso y conserva las ventas y movimientos que registró.

### 2.4 Supabase y acceso a datos

- El esquema de negocio vive en Postgres y se versiona con migraciones en
  supabase/migrations/.
- RLS se activa en cada tabla expuesta. Cada política se define según usuario,
  rol y operación; no se considera suficiente estar autenticado.
- Las decisiones de autorización no se basan en campos editables por el usuario.
- Las consultas de la aplicación usan clientes Supabase vinculados a la sesión.
  Las operaciones que requieren más de un cambio usan funciones transaccionales
  con validación propia.
- La clave de servicio y cualquier clave privada quedan en el entorno servidor
  de Supabase o Next.js. No se usan en componentes cliente ni variables
  NEXT_PUBLIC.
- Las lecturas de información personal evitan cachés compartidas entre
  usuarios. No se activa Realtime en el MVP sin un flujo que lo necesite.

Las funciones con privilegios elevados se evitarán. Si una función SECURITY
DEFINER resulta imprescindible para resolver una frontera de RLS, se colocará
fuera del esquema expuesto, comprobará auth.uid() explícitamente, tendrá
permisos EXECUTE mínimos y contará con revisión de seguridad.

## 3. Diseño del backend

### 3.1 Módulos de datos

El esquema se organiza alrededor de las funciones de negocio del MVP:

1. **Empresa y configuración:** un único registro compartido con nombre, datos
   fiscales, moneda, parámetros tributarios validados, series y preferencias
   mínimas.
2. **Usuarios y roles:** perfil de usuario, rol, estado, invitaciones y fechas
   de alta o baja.
3. **Productos y catálogo:** categorías simples, productos, códigos y unidad de
   medida. Cada producto puede tener hasta dos ejes de opciones, por ejemplo
   talla y color; los productos sin combinaciones también son válidos.
4. **Inventario:** existencias y un libro de movimientos con cantidad, motivo,
   fecha y usuario. Los cambios de saldo se realizan desde funciones de
   negocio, no escribiendo un contador desde el cliente.
5. **Clientes:** datos de contacto y documento necesarios para operar y emitir.
   La venta conserva una copia de los datos fiscales usados al emitir para que
   los cambios posteriores del cliente no alteren un comprobante anterior.
6. **Ventas:** encabezado y líneas, estado de borrador/confirmada, usuario
   responsable, importes calculados en servidor y snapshot de
   descripción y precio.
7. **Facturación:** comprobante asociado a la venta, tipo, serie, correlativo,
   estado, respuesta fiscal y registro de intentos. La emisión prevista es por
   NubeFacT.
8. **Asistente:** conversaciones y mensajes con el mínimo de datos necesario
   para conservar contexto y mostrar historial.
9. **Auditoría operativa:** autor, fecha, objeto y acción para cambios de
   configuración fiscal, inventario y operaciones de venta/facturación que
   necesiten rastreo.

El MVP asume un catálogo textil derivado de Trayecto. Los ejes con nombre
configurable permiten representar talla y color sin imponerlos a productos que
se venden por unidad, metro, kilo, docena u otra unidad configurada.

### 3.2 Reglas de venta e inventario

- La pantalla puede calcular una vista previa, pero el servidor vuelve a
  validar producto, variante, cantidad, precio, impuestos y total.
- Los importes se guardan como decimales monetarios. No se acepta el precio
  calculado por el navegador como autoridad.
- Una venta en borrador no cambia existencias.
- Confirmar una venta ejecuta una única operación transaccional que valida la
  venta, calcula sus importes, descuenta existencias y registra un movimiento
  por cada línea. Si cualquier paso falla, no queda una confirmación parcial.
- La política inicial permite que el vendedor consulte sus propias ventas y el
  administrador consulte todas. Esta visibilidad queda como supuesto para
  confirmar con Tomhjey durante la revisión funcional.
- Los ajustes de stock requieren administrador y siempre registran motivo y
  usuario.
- Un borrador puede descartarse y conserva su historial. La primera versión no
  anula ventas ya confirmadas; esa acción requiere definir el flujo de
  devolución y el documento fiscal que la respalda.

### 3.3 Facturación electrónica con NubeFacT

NubeFacT forma parte del flujo previsto desde el MVP. No habrá selector de
proveedor ni un modo de facturación manual alternativo.

- Las credenciales de NubeFacT se guardan como secretos del entorno de
  Supabase, y solo las lee la Edge Function de facturación. El navegador nunca
  las recibe.
- La aplicación admite la emisión de boletas y facturas asociadas a una venta.
  Los datos obligatorios se validan antes de reservar un número.
- La función de emisión reserva y persiste el correlativo antes de llamar al
  proveedor. Un reintento reutiliza ese mismo número para evitar comprobantes
  fiscales duplicados.
- Si el resultado de una llamada es incierto, la función consulta el documento
  al proveedor antes de reintentar. La respuesta de NubeFacT se conserva para
  soporte y trazabilidad sin guardar secretos.
- Los estados de emisión son visibles desde la venta y el módulo de
  facturación. Los errores transitorios permiten reintentar por una acción
  autorizada o por una tarea backend idempotente.
- La disponibilidad de NubeFacT no se convierte en un modo de producto ni en
  una ruta alternativa de emisión. Si el proveedor no responde, la operación
  queda con estado y error recuperables.
- La emisión inicial cubre boletas y facturas. Notas de crédito y anulaciones
  fiscales quedan fuera de la primera versión y requieren validación de la
  empresa antes de iniciar desarrollo fiscal.

La integración se implementará con base en el manual de NubeFacT ya verificado
en Trayecto y se volverá a contrastar con el contrato vigente del proveedor
antes de escribir la Edge Function.

### 3.4 Asistente con IA

El asistente es una función central del MVP y se implementa del lado servidor
mediante una Edge Function. El proveedor y el modelo se mantienen configurables
para poder reemplazarlos sin cambiar los módulos de ventas e inventario.

El asistente puede:

- Buscar productos y consultar sus precios y existencias.
- Resumir ventas del usuario dentro de sus permisos.
- Explicar las pantallas y el flujo de trabajo con contenido de ayuda curado.
- Preparar o actualizar un borrador de venta, mostrando productos encontrados,
  cantidades, precios calculados por servidor y advertencias.

El asistente no consulta Postgres libremente ni recibe una herramienta que
confirme, emita, anule o ajuste inventario. Cada llamada de herramienta pasa por
un despachador con lista permitida, valida argumentos y aplica los mismos roles
que la interfaz. La confirmación final se realiza desde una acción explícita de
la persona y vuelve a validar todas las reglas en el backend.

Las claves del proveedor de IA se guardan como secretos. Se limita la cantidad
de herramientas y vueltas por interacción, se manejan errores sin perder el
estado de la conversación y se limita el contexto enviado al proveedor. Los
documentos, teléfonos, correos y otros datos de clientes no se envían salvo que
una función lo requiera; por defecto se minimizan o enmascaran.

Para cambiar de proveedor, la integración implementa una interfaz interna
estable para crear respuestas y llamadas de herramientas. El formato propio
del proveedor no se filtra a la lógica de negocio ni a los componentes de
frontend.

### 3.5 Errores, consistencia y trazabilidad

- Las operaciones que modifican importes, correlativos o stock son atómicas e
  idempotentes cuando pueden reintentarse.
- Los errores de validación se distinguen de fallos temporales de red o del
  proveedor. El frontend recibe mensajes aptos para el usuario y el backend
  conserva detalles técnicos sin credenciales ni datos innecesarios.
- Las operaciones importantes guardan usuario, fecha y resultado.
- Una respuesta externa o webhook no constituye por sí misma autorización para
  cambiar un estado fiscal. El backend consulta el estado con las credenciales
  de la empresa cuando sea necesario.
- Las políticas, funciones SQL y Edge Functions se prueban con cada rol, además
  de probar los flujos felices.

## 4. Diseño del frontend

### 4.1 Reutilización del sistema visual de Trayecto

Se conserva el sistema de diseño existente como contrato visual: paleta, tokens,
tipografía, espaciado, formas, estilos de controles, estados, componentes base
y copy aprobado. No se introduce una paleta paralela ni se sustituyen los
componentes por controles genéricos con estilos distintos.

La fuente de referencia es el frontend de Trayecto:

- frontend/src/estilos/tokens/ contiene tokens base, paleta, paleta de Trayecto,
  tipografía y formas.
- frontend/src/estilos/componentes/ contiene reglas de componentes base,
  formularios, datos, navegación, diálogos y superficie pública.
- frontend/src/sistema/ contiene componentes React tipados, formularios,
  validación, diálogos, datos, iconos y navegación.
- frontend/public/fuentes/ contiene archivos WOFF2 de Bricolage Grotesque,
  Figtree e IBM Plex Mono.

El traslado copia esos archivos al nuevo repo y adapta solo lo necesario para
Next.js. Los estilos específicos de pantalla se portan al módulo equivalente
cuando forman parte del MVP, manteniendo los tokens y reglas del sistema. Los
componentes que dependan de React Router se adaptan a las rutas del App Router.
Los componentes que no dependen del router se conservan con el mismo
comportamiento y clases.

El logotipo es una decisión de marca independiente del sistema visual. Hasta
recibir un paquete de marca de Tomhjey, se usa una identificación textual
neutral del producto.

### 4.2 Next.js y CSS

- Next.js App Router organiza las páginas por rutas y layouts. El panel privado
  se construye en layouts autenticados; las vistas usan Server Components por
  defecto y Client Components solo para interacciones que necesitan estado del
  navegador.
- Supabase SSR usa un cliente de servidor y otro de navegador. El Proxy de
  Next.js renueva cookies de sesión, pero las operaciones verifican usuario y
  permisos en RLS o en la función correspondiente.
- Tailwind CSS 4 se incorpora con el plugin PostCSS compatible con Next.js.
  Sus utilidades sirven para disposición, rejillas y espaciado. Color,
  tipografía y apariencia visual salen del sistema de diseño.
- La hoja global se importa desde el layout raíz. Tailwind se procesa antes
  que el CSS del sistema; los estilos base del sistema conservan el orden de
  importación aprobado en Trayecto.
- Las fuentes se sirven desde el dominio de la aplicación, con los mismos
  pesos y subconjuntos del sistema existente.
- Prettier mantiene formato uniforme junto con ESLint y TypeScript.

### 4.3 Navegación y módulos visibles

La aplicación incluye:

- Acceso y cierre de sesión.
- Inicio con actividad y alertas simples de stock.
- Productos y catálogo.
- Inventario y movimientos.
- Clientes.
- Ventas: lista, detalle y creación.
- Facturación: comprobante, estado, reintento y descarga si el proveedor la
  ofrece.
- Asistente de IA, accesible desde las páginas de operación y desde la
  navegación principal.
- Reportes básicos.
- Empresa y equipo, visibles solo para administración según el rol.

La barra lateral de escritorio y la navegación móvil seguirán el patrón de
Trayecto. En pantallas pequeñas, las secciones principales pasan a una barra
inferior y las restantes se agrupan en una hoja de navegación.

### 4.4 Uso de datos y estados de interfaz

- El servidor de datos es la fuente de verdad para precios, existencias,
  permisos y estados fiscales.
- Cada pantalla contempla carga, lista vacía, error recuperable y resultado
  exitoso.
- Las mutaciones muestran su error junto a la acción o en el aviso de la página.
- Formularios conservan validaciones coherentes con las reglas del servidor;
  ninguna validación exclusiva del navegador debe rechazar datos aceptados por
  el backend.
- Los diálogos usan el componente nativo y los controles del sistema. Acciones
  difíciles de deshacer muestran confirmación.
- Las tablas incluyen rótulos de columna para lectura móvil. Los datos numéricos
  y monetarios conservan alineación y formato legibles.
- El asistente muestra la diferencia entre una consulta, una propuesta y una
  acción confirmada. Una propuesta de venta se representa como borrador con el
  precio y las advertencias devueltos por el servidor.

### 4.5 Roles reflejados en interfaz

El frontend puede ocultar rutas y acciones que el rol no usa para evitar
errores de navegación. Esa presentación no sustituye RLS ni la comprobación del
servidor. El vendedor no ve administración de usuarios, ajustes de inventario
ni configuración fiscal. Los importes e informes que el vendedor vea respetan
el alcance de las ventas que puede consultar.

## 5. Criterios de aceptación del diseño

El usuario aprobó la arquitectura de Supabase/Postgres, RLS, funciones transaccionales y Edge
Functions para NubeFacT e IA el 2026-10-07. La visibilidad del vendedor se asume limitada a
sus ventas; el backend la aplica tanto en RLS como en las funciones SQL. La marca de Tomhjey
sigue pendiente de su paquete propio; el sistema visual de Trayecto se conserva como referencia
del frontend.

El plan de implementación posterior se divide en dos documentos coordinados:
backend y frontend. Ambos respetan esta fuente de verdad y comienzan por los
contratos compartidos de datos y permisos.

## 6. Supuestos para revisión

- El MVP se ejecuta para una sola empresa y no habrá tenant_id en las tablas de
  negocio.
- La primera versión solo permite descartar borradores; una venta confirmada
  queda protegida contra edición y anulación hasta definir el flujo fiscal de
  devolución.
- El catálogo conserva los ejes configurables de producto de Trayecto para
  cubrir talla, color y productos sin variantes.
- Un vendedor consulta solo las ventas que registró; el administrador consulta
  todas.
- La emisión inicial cubre boleta y factura por NubeFacT. Notas de crédito y
  anulaciones fiscales quedan fuera hasta validación explícita de la empresa.
- La IA usa una integración reemplazable y nunca confirma operaciones.
- El sistema visual de Trayecto se reutiliza. La identidad gráfica de Tomhjey
  se trata aparte y no se reemplaza por la marca de Trayecto.

## 7. Referencias técnicas

- Supabase, [cliente SSR con Next.js](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
- Supabase, [Edge Functions](https://supabase.com/docs/guides/functions).
- Next.js, [CSS y Tailwind](https://nextjs.org/docs/app/getting-started/css).
- Repositorio Trayecto-inventario, docs/manuales/nubefact.md.
- Repositorio Trayecto-inventario, docs/manuales/openai-asistente.md.
- Repositorio Trayecto-inventario, frontend/AGENTS.md.
