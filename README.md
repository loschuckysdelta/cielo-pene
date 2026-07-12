# Cielo Postres · Catálogo + API + Panel administrador

Proyecto listo para desplegar en Vercel con catálogo público, panel administrativo, MongoDB y Cloudinary.

## Accesos

- Catálogo: `/` o `/catalogo`
- Panel: `/admin`
- Credencial inicial del panel: `Chucky123`

> La credencial del HTML es una protección básica del panel. Para una tienda en producción se recomienda agregar autenticación en el servidor.

## Funciones del panel

- Dashboard con ventas de hoy, ventas del mes, clientes, stock y cupones usados.
- Gráfico de ventas de los últimos 7 días.
- Pedidos recientes y productos más vendidos.
- Productos con hasta 5 imágenes, precio, descuento, stock, categoría y estado.
- Pedidos con confirmación, descuento de stock y restauración al cancelar.
- Reseñas pendientes, aprobadas u ocultas.
- Cupones limitados o ilimitados.
- Zonas de delivery con precio fijo o por coordinar.
- Datos del negocio, redes sociales, WhatsApp, ubicación y horario.
- Vista adaptable para computadora y celular.

## Reseñas

El cliente puede enviar una reseña desde el catálogo. La reseña se guarda como `pendiente` y no aparece públicamente hasta que el administrador la aprueba desde `/admin`.

API:

- `GET /api/resenas` — reseñas aprobadas.
- `GET /api/resenas?admin=1` — todas las reseñas.
- `POST /api/resenas` — enviar reseña.
- `PUT /api/resenas?id=ID` — aprobar u ocultar.
- `DELETE /api/resenas?id=ID` — eliminar.

## Variables de entorno en Vercel

```env
MONGO_URI=mongodb+srv://...
MONGO_DB_NAME=antoja2
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Si `MONGO_URI` no está configurado, el proyecto funciona en memoria temporal y los cambios se pierden cuando Vercel reinicia la función.

## Despliegue

1. Sube la carpeta completa a GitHub.
2. Importa el repositorio en Vercel.
3. Agrega las variables de entorno.
4. Ejecuta un nuevo deployment.

Node.js requerido: 24.x.
