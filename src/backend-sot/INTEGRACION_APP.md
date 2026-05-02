# Integración del módulo de ventas en app.js

## 1. Registrar la ruta en app.js

Agrega estas líneas en tu `app.js` (o `server.js`) existente:

```js
// app.js
const salesRoutes = require('./src/routes/v1/salesRoutes');

// Asumiendo que ya tienes: app.use(express.json())
// Registrar las rutas de ventas bajo /v1/sales
app.use('/v1/sales', salesRoutes);
```

## 2. Middleware de autenticación esperado

El router espera que `req.user` esté poblado con:

```js
req.user = {
  id: 'uuid-del-usuario',
  email: 'email@ejemplo.com',
  organization_id: 'uuid-de-la-org',
  role: 'ORG_ADMIN' // o el rol que uses
}
```

Si tu `authMiddleware` ya valida el JWT y puebla `req.user`, úsalo directamente.
Si el middleware es global (app-level), puedes removerlo del router en `salesRoutes.js`.

## 3. Variables de entorno requeridas (Render)

Asegúrate de tener en el panel de Render → Environment:

```
DATABASE_URL=postgresql://user:password@host:5432/dbname
NODE_ENV=production
```

## 4. Ejecutar migración SQL

En la base de datos PostgreSQL (Render Postgres):

```bash
psql $DATABASE_URL -f src/db/migrations/001_create_sales_tables.sql
```

O desde la UI de Render/Supabase ejecutar el contenido del archivo SQL.

## 5. Probar el endpoint

```bash
# Con curl (reemplaza <TOKEN> y <BASE_URL>)
curl -X POST https://techrepairpro-core-1.onrender.com/v1/sales \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method": "efectivo",
    "total": 5000,
    "subtotal": 5000,
    "items": [
      {
        "description": "Cambio de pantalla",
        "quantity": 1,
        "unit_price": 5000,
        "tipo": "service"
      }
    ]
  }'
```

Respuesta esperada `201`:
```json
{
  "success": true,
  "data": {
    "id": "uuid...",
    "organization_id": "...",
    "total": 5000,
    "status": "paid",
    ...
    "items": [...]
  }
}
```

## 6. Estructura de archivos creados

```
backend-sot/
└── src/
    ├── db/
    │   ├── index.js                          ← Pool pg
    │   └── migrations/
    │       └── 001_create_sales_tables.sql   ← SQL de tablas
    ├── models/
    │   ├── saleModel.js                      ← INSERT/SELECT sales
    │   ├── saleItemModel.js                  ← INSERT/SELECT sale_items
    │   └── inventoryModel.js                 ← SELECT FOR UPDATE + deductStock + movements
    ├── services/
    │   └── saleService.js                    ← Lógica transaccional (BEGIN/COMMIT/ROLLBACK)
    ├── controllers/
    │   └── saleController.js                 ← HTTP handler
    └── routes/
        └── v1/
            └── salesRoutes.js                ← POST /v1/sales
``