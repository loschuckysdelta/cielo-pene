# Cielo Postres · Tienda, panel administrador y panel del cliente

Proyecto listo para Vercel con catálogo público, panel administrativo, MongoDB, Cloudinary, reseñas, administradores, gestores, cuentas de clientes y notificaciones de pedidos.

## Accesos

- Tienda pública: `/` o `/catalogo`
- Panel administrador: `/admin`
- Panel del cliente: `/cuenta`
- Correo inicial del administrador: `admin@cielopostres.com`
- Contraseña inicial: `Chucky123`

En producción cambia la cuenta inicial y los secretos desde las variables de entorno.

## Funciones principales

- Vista previa en tiempo real al crear o editar productos.
- Hasta cinco imágenes por producto, con imagen principal y miniaturas.
- Productos, categorías, pedidos, delivery, cupones y reseñas.
- Administrador principal, administradores y gestores con permisos.
- Permiso **Usuarios y administradores** para crear otros admins y gestores.
- Sección administrativa de clientes registrados.
- Registro e inicio de sesión para clientes.
- Panel del cliente con pedidos, perfil y notificaciones.
- Notificaciones automáticas por estado:
  - Pedido recibido.
  - Pedido confirmado.
  - Preparando.
  - Listo para recoger o listo para delivery.
  - En camino.
  - Entregado.
  - Cancelado.
- Mensajes personalizados enviados desde cada pedido.
- El panel del cliente se actualiza automáticamente cada 30 segundos.
- Descuento y restauración automática del stock al confirmar o cancelar.
- Contraseñas protegidas con `scrypt`.

No se agregó control de ingredientes por postre.

## Flujo de notificaciones

1. El cliente crea su cuenta en `/cuenta`.
2. Inicia sesión antes de finalizar su compra.
3. El pedido queda vinculado a su cuenta.
4. Desde `/admin`, el administrador cambia el estado del pedido.
5. El cliente recibe el aviso en su panel.

Ejemplo para recojo:

> Juanito, tu pedido ya está listo. Ya puedes venir a recogerlo.

Ejemplo para delivery:

> Juanito, tu pedido ya salió y está en camino.

## Variables de entorno en Vercel

```env
MONGO_URI=mongodb+srv://...
MONGO_DB_NAME=antoja2
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

ADMIN_EMAIL=admin@cielopostres.com
ADMIN_PASSWORD=UnaClaveSegura123
AUTH_SECRET=un_secreto_largo_para_administradores
CLIENT_AUTH_SECRET=otro_secreto_largo_para_clientes
```

Si `MONGO_URI` no está configurado, el proyecto usa memoria temporal y los datos pueden desaparecer cuando Vercel reinicie la función.

## APIs de clientes y notificaciones

- `POST /api/clientes-auth` — registro o inicio de sesión.
- `GET /api/clientes-auth` — perfil del cliente autenticado.
- `PUT /api/clientes-auth` — actualizar perfil.
- `GET /api/mis-pedidos` — pedidos vinculados a la cuenta.
- `GET /api/notificaciones` — notificaciones del cliente.
- `PUT /api/notificaciones` — marcar una o todas como leídas.
- `GET /api/clientes` — lista administrativa de clientes.
- `PUT /api/clientes?id=ID` — activar o bloquear un cliente.

## Despliegue

1. Sube la carpeta completa a GitHub.
2. Importa el repositorio en Vercel.
3. Agrega las variables de entorno.
4. Realiza un nuevo deployment.

Node.js requerido: 24.x.
