# Scout Data F.C. — Setup de Deploy

## 1. Criar projeto no Cloudflare Pages

```bash
npx wrangler pages project create scout-data-fc
```

## 2. Criar banco D1

```bash
npx wrangler d1 create scout-data-fc-db
# Copie o database_id gerado e cole em wrangler.toml
```

## 3. Rodar migration

```bash
npm run db:init:remote
```

## 4. Configurar secrets

```bash
# Gere os valores:
openssl rand -hex 24   # → DASH_KEY
openssl rand -hex 24   # → SYNC_SECRET
uuidgen                # → KIWIFY_WEBHOOK_SLUG (use em minúsculas)

# Adicione ao projeto:
npx wrangler pages secret put DASH_KEY
npx wrangler pages secret put META_PIXEL_ID
npx wrangler pages secret put META_ACCESS_TOKEN
npx wrangler pages secret put GA4_MEASUREMENT_ID
npx wrangler pages secret put GA4_API_SECRET
npx wrangler pages secret put KIWIFY_WEBHOOK_SLUG
npx wrangler pages secret put SYNC_SECRET
```

## 5. Atualizar placeholders na landing page

Em `public/index.html`, substitua:
- `META_PIXEL_ID_PLACEHOLDER` → seu Pixel ID real
- `GA4_MEASUREMENT_ID_PLACEHOLDER` → seu G-XXXXXXXXXX
- `SUBSTITUA_AQUI` no link do Kiwify → URL real de pagamento
- `SUBSTITUA_CALENDLY_SLUG` → seu link Calendly

## 6. Deploy

```bash
npm run deploy
```

## 7. Configurar Kiwify webhook

Na Kiwify, cadastre a URL do webhook:
```
https://scout-data-fc.pages.dev/api/kiwify-webhook/SEU_KIWIFY_WEBHOOK_SLUG
```

## 8. Acessar dashboard

```
https://scout-data-fc.pages.dev/dash?key=SEU_DASH_KEY
```

## Desenvolvimento local

```bash
npm run dev
# Acesse http://localhost:8788
```
