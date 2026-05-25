# Optiyou Cloudflare-First Platform

Optiyou is a product intelligence platform for U.S./Canada packaged food. The iOS scanner is the first client, but the moat is the product database, versioned scoring methodology, evidence graph, personalization engine, contribution system, and trusted recommendation layer.

## Service Boundaries

- `optiyou-api`: public product lookup, scan, score, alternatives, contribution, upload, AI ask, methodology, profile, and history endpoints.
- `optiyou-auth`: token verification and profile ownership. The current Worker has a bearer-token adapter; replace it with service-bound auth verification before production auth claims.
- `optiyou-subscriptions`: StoreKit notification ingestion and premium entitlement sync.
- `optiyou-ingestion`: Queue-driven product shell creation, artifact processing, OCR/extraction, score creation, and correction workflow entry.
- `optiyou-ai`: Workers AI extraction/classification/explanation plus AI Gateway routing, caching, fallbacks, observability, and rate control.
- `optiyou-admin-api`: Access-protected review tools for product search, extraction review, duplicate merge, corrections, evidence updates, rescoring, and audit.
- `optiyou-brand-api`: later brand confirmation and brand-supplied label updates.

## Cloudflare Storage Map

- D1: structured truth: users, profiles, subscriptions, products, versions, field sources, nutrition, ingredients, allergens, scores, history, contributions, reviews, alternatives, and audit log.
- R2: product photos, label scans, raw payloads, OCR output, AI artifacts, and evidence documents.
- KV: hot barcode cards, app config, methodology metadata, alternatives, and ingestion state.
- Queues: ingestion, OCR/extraction, scoring, AI explanations, and notifications.
- Workflows: durable missing-product ingestion, rescoring, correction review, and alternatives refresh.
- Workers AI: extraction, normalization, category classification, explanations, embeddings.
- AI Gateway: AI routing, caching, fallback control, cost/latency observability, rate limits.
- Vectorize: semantic product/evidence search and RAG over approved evidence documents.
- Analytics Engine: scan events, conversion, missing-product rate, AI cost, alternative clicks, saves, corrections, repeat usage, and share rate.
- Pages + Access: admin and future brand portals.

## Trust Rules

- Deterministic scoring is the source of truth. AI extracts, normalizes, summarizes, and answers questions, but AI never decides final scores.
- Every product field tracks source, timestamp, confidence, verification status, last seen date, user contribution count, brand confirmation, and conflict flags.
- Low-confidence data must be labeled as low confidence and never presented as verified fact.
- Alternatives must be same-category, similar-use, higher-scoring, personalized, and never paid placements.
- AI explanations must map every claim back to a product field, scoring rule, methodology item, or approved evidence document.
- Avoid medical claims and fear language. Optiyou is product-label education and comparison, not medical advice.

## MVP Build Order

1. Worker API.
2. D1 schema.
3. Food scoring engine.
4. R2 uploads.
5. KV cache.
6. Missing-product contribution.
7. Queue-based AI extraction.
8. Admin portal.
9. StoreKit subscriptions.
10. Workflows and Vectorize.

## Metrics

- Scans per user per week.
- Scan success rate.
- Missing-product rate.
- Result completion rate.
- Alternative clicks.
- Saves.
- Premium conversion.
- Corrections.
- Repeat usage.
- Share rate.
