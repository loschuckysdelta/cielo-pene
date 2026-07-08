# Antoja2 · API + Panel + Catálogo

Proyecto listo para Vercel con:

- Catálogo público profesional en `/`
- Panel admin en `/admin`
- APIs visibles en el panel
- Productos con precio, stock, descripción, descuento y carrusel de hasta 5 imágenes
- Categorías editables
- Pedidos guardados antes de abrir WhatsApp
- Confirmar pedido y descontar stock real
- Delivery por zonas
- Cupones ilimitados o limitados por usos
- Datos del negocio editables: WhatsApp, ubicación, Google Maps, Instagram, Facebook, TikTok y horario

## APIs principales

- `/api/productos`
- `/api/categorias`
- `/api/configuracion`
- `/api/delivery`
- `/api/cupones`
- `/api/pedidos`
- `/api/status`

## Variables en Vercel

Pega tus variables en Vercel → Settings → Environments → Production → Import .env.

No subas `.env` a GitHub.


## Actualización contacto clickeable
- Las tarjetas de WhatsApp y Ubicación ahora son clickeables.
- Si no pegas Link Google Maps, la web abre Google Maps buscando la dirección.
- En /admin → Negocio puedes agregar Instagram, Facebook, TikTok, YouTube, Telegram, X/Twitter, Threads y web extra.
