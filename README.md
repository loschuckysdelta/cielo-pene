# Cielo Postres · Catálogo, API y panel administrador

Proyecto listo para Vercel con catálogo público, panel administrativo, MongoDB, Cloudinary, reseñas, usuarios, administradores y gestores.

## Accesos iniciales

- Catálogo público: `/` o `/catalogo`
- Panel administrador: `/admin`
- Correo inicial: `admin@cielopostres.com`
- Contraseña inicial: `Chucky123`

El primer acceso crea automáticamente la cuenta de **Administrador principal**. En producción cambia el correo, la contraseña y el secreto mediante variables de entorno.

## Novedades incluidas

- Vista previa en tiempo real al editar un producto.
- Vista de imagen principal y miniaturas.
- Posibilidad de quitar imágenes antiguas y agregar nuevas, hasta un máximo de cinco.
- Usuarios con inicio de sesión por correo y contraseña.
- Administrador principal con acceso total.
- Administradores con permisos configurables.
- Gestores con acceso únicamente a las áreas seleccionadas.
- Permiso especial **Usuarios y administradores**, para crear otro administrador que pueda registrar admins y gestores.
- Activar, desactivar, editar y eliminar usuarios.
- Contraseñas almacenadas con hash `scrypt`.
- Sesiones firmadas con vencimiento de 12 horas.

## Roles

### Administrador principal

Existe una sola cuenta principal. Tiene acceso total y no puede ser eliminada por otro usuario.

### Administrador

Puede recibir permisos amplios. Para permitirle crear usuarios, activa el permiso **Usuarios y administradores**.

### Gestor

Tiene permisos específicos, por ejemplo solo productos, pedidos, reseñas o delivery.

## Variables de entorno en Vercel

```env
MONGO_URI=mongodb+srv://...
MONGO_DB_NAME=antoja2
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

ADMIN_EMAIL=admin@cielopostres.com
ADMIN_PASSWORD=UnaClaveSegura123
AUTH_SECRET=un_secreto_largo_y_aleatorio
```

`ADMIN_EMAIL` y `ADMIN_PASSWORD` se usan únicamente cuando todavía no existe el administrador principal.

Si `MONGO_URI` no está configurado, el proyecto funciona en memoria temporal. Los productos, usuarios y demás cambios pueden desaparecer cuando Vercel reinicie la función.

## APIs nuevas

- `POST /api/auth` — iniciar sesión.
- `GET /api/auth` — obtener la cuenta de la sesión.
- `GET /api/usuarios` — listar usuarios autorizados.
- `POST /api/usuarios` — crear administrador o gestor.
- `PUT /api/usuarios?id=ID` — editar usuario, permisos o contraseña.
- `DELETE /api/usuarios?id=ID` — eliminar usuario.

## Despliegue

1. Sube la carpeta completa a GitHub.
2. Importa el repositorio en Vercel.
3. Agrega las variables de entorno.
4. Realiza un nuevo deployment.

Node.js requerido: 24.x.
