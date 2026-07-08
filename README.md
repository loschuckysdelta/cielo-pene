# Antoja2 - API + Admin + Catálogo

Proyecto listo para Vercel con:

- Catálogo público en `/`
- Panel admin en `/admin`
- API pública en `/api/*`
- MongoDB para guardar productos, categorías, pedidos, delivery y cupones
- Cloudinary para imágenes
- Stock real: baja solo cuando confirmas pedido
- Delivery por zonas

## Importante

Este ZIP NO trae `.env` ni claves dentro del código. Las variables se ponen en Vercel:

Project → Settings → Environments → Production → Variables / Environment Variables

Luego haz Redeploy sin cache.

## Variables necesarias en Vercel

- MONGO_URI
- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET

## Subir a GitHub

En PowerShell, dentro de tu repositorio:

```powershell
Remove-Item api, public -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item package.json, package-lock.json, vercel.json, README.md, .env, .env.local, .env.example -Force -ErrorAction SilentlyContinue
```

Copia el contenido de este ZIP dentro del repo y luego:

```powershell
git add .
git commit -m "actualiza antoja2 final"
git push
```

Después en Vercel: Deployments → Redeploy → desmarca Use existing Build Cache.
