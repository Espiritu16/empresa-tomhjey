# Alcance del MVP de Empresa Tomhjey

## Propósito

Aplicación para que una empresa gestione productos, existencias, ventas y facturación
electrónica con asistencia de IA. El producto no administra otras empresas como un SaaS.

## Módulos

1. **Inicio:** actividad reciente y alertas simples de existencias.
2. **Empresa y configuración:** datos comerciales y fiscales requeridos para operar y emitir.
3. **Usuarios y roles:** acceso del equipo con administrador y vendedor.
4. **Productos y catálogo:** productos, tallas o colores, precios y unidades.
5. **Inventario:** existencias y movimientos con motivo, fecha y usuario.
6. **Clientes:** datos esenciales e historial de ventas.
7. **Ventas:** registrar y consultar ventas; el servidor valida y calcula los importes.
8. **Facturación electrónica:** emisión y seguimiento de comprobantes mediante NubeFacT.
9. **Asistente con IA:** consultas del negocio y preparación de acciones; la persona confirma
   antes de guardar cambios.
10. **Reportes básicos:** ventas por periodo, productos vendidos y existencias; los importes se presentan separados por moneda.

## Roles

| Capacidad                               | Administrador | Vendedor      |
| --------------------------------------- | ------------- | ------------- |
| Gestionar equipo y configuración fiscal | Sí            | No            |
| Crear, editar e inactivar productos     | Sí            | Sí            |
| Crear categorías                        | Sí            | No            |
| Consultar existencias                   | Sí            | Sí            |
| Ajustar existencias                     | Sí            | No            |
| Registrar ventas                        | Sí            | Sí            |
| Consultar reportes generales            | Sí            | Sí            |
| Usar el asistente con IA                | Sí            | Sí            |

La autorización se aplica en servidor y base de datos. La interfaz no es una barrera de
seguridad. Las ventas y sus reportes son compartidos por el equipo; el rol controla el acceso
a funciones administrativas, no filtra los totales por la persona que registró la venta.

## Facturación del MVP

- Administración configura una serie F para facturas y una B para boletas; el correlativo no
  puede retroceder.
- Al armar una venta, la persona elige factura o boleta y esa elección queda guardada en el
  borrador. Al confirmarla, el sistema la envía a NubeFacT inmediatamente. No existe un paso
  posterior de «facturar».
- El vendedor puede emitir y reintentar únicamente comprobantes de sus propias ventas. La
  configuración fiscal y la consulta de aceptación de boletas quedan para administración.
- Facturas requieren RUC válido de la empresa y del cliente. Una boleta simple puede emitirse
  sin cliente si el total es menor de S/ 700; desde S/ 700 exactos se identifica al cliente.
- La emisión exitosa de una factura muestra la aceptación que devuelve NubeFacT. Si queda
  pendiente, administración puede consultar su estado manualmente. La boleta se muestra como
  pendiente y permite consultar su aceptación desde el séptimo día, con consultas separadas
  por al menos 24 horas mientras siga pendiente.
- No hay consulta automática ni cron. Notas de crédito y anulaciones fiscales quedan fuera del
  MVP actual.
- Facturación sirve para consultar estados, reintentar envíos recuperables y revisar PDF; no
  ofrece una lista de ventas pendientes para emitir manualmente.

## Límites

- Una empresa y una operación compartida por su equipo; sin alta SaaS ni administración de
  múltiples empresas.
- Dos roles sencillos; sin permisos configurables por pantalla.
- Sin sucursales, locales o stock separado por sede.
- NubeFacT es la integración de facturación prevista. No se incluye selector de proveedor ni
  modo manual alternativo.
- La IA respeta los permisos del usuario. Para preparar una venta pregunta si será factura o
  boleta cuando aún no se indicó; puede preparar una boleta simple sin cliente por debajo de
  S/ 700, pero no confirma operaciones ni evita las validaciones del servidor.
- Sin compras a proveedores, predicción de demanda, tienda en línea, catálogo público,
  analítica avanzada, planes o suscripciones.

## Decisiones pendientes

- Flujos fiscales de anulaciones y notas de crédito.
- Visibilidad de ventas para el rol vendedor.
- Proveedor/modelo de IA y límites de uso.
- Credenciales y entorno de pruebas de NubeFacT para la empresa.
