# Antoja2 API + Admin final

Proyecto listo para Vercel con:

- Catálogo público `/`
- Panel admin `/admin`
- APIs públicas abiertas `/api/...`
- MongoDB Atlas
- Cloudinary para imágenes
- Productos con carrusel de hasta 5 imágenes
- Stock real
- Pedidos obligatorios antes de abrir WhatsApp
- Confirmar pedido descuenta stock
- Cancelar pedido restaura stock si ya estaba confirmado
- Delivery por zonas
- Cupones ilimitados o limitados por usos

## Variables en Vercel

En Vercel usa **Settings → Environments → Production → Environment Variables → Import .env** y pega tus variables.

No subas `.env` a GitHub.

## Subir actualización al repo

```powershell
cd C:\ruta\de\tu\cielo-postres
Remove-Item api, public -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item package.json, package-lock.json, vercel.json, README.md, .env, .env.local, .env.example -Force -ErrorAction SilentlyContinue
```

Copia dentro del repo todo el contenido de este ZIP y luego:

```powershell
git add .
git commit -m "antoja2 final con apis y cupones limitados"
git push
```

En Vercel haz **Redeploy** y desmarca **Use existing Build Cache**.

## APIs principales

- `GET /api/status`
- `GET /api/productos`
- `GET /api/productos?admin=1`
- `POST /api/productos`
- `PUT /api/productos?id=ID`
- `DELETE /api/productos?id=ID`
- `GET /api/categorias`
- `POST /api/categorias`
- `GET /api/delivery`
- `POST /api/delivery`
- `GET /api/cupones`
- `GET /api/cupones?admin=1`
- `GET /api/cupones?codigo=ANTOJO10`
- `POST /api/cupones`
- `PUT /api/cupones?id=ID`
- `DELETE /api/cupones?id=ID`
- `GET /api/pedidos`
- `POST /api/pedidos`
- `PUT /api/pedidos?id=ID` con `{ "accion": "confirmar" }` o `{ "accion": "cancelar" }`
- `GET /api/configuracion`
- `PUT /api/configuracion`

## Cupón ilimitado

```json
{
  "codigo": "ANTOJO10",
  "tipo": "porcentaje",
  "valor": 10,
  "modoUso": "ilimitado",
  "limiteUsos": 0,
  "activo": true
}
```

## Cupón limitado para 20 usos

```json
{
  "codigo": "20PERSONAS",
  "tipo": "porcentaje",
  "valor": 15,
  "modoUso": "limitado",
  "limiteUsos": 20,
  "activo": true
}
```

El uso del cupón se cuenta cuando confirmas el pedido en el panel. Si el pedido se cancela después de confirmado, el uso del cupón se restaura.
