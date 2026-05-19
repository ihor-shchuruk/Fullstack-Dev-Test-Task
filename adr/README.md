# Architecture Decision Records (ADRs)

We use ADRs to capture significant architectural decisions. ADRs provide context for future engineers (and AI assistants) about why the system is built the way it is.

## What Warrants an ADR?

- Choosing a technology, framework, or service (e.g., SQS vs RabbitMQ)
- Changing how repos communicate (API contracts, message formats)
- Adding or removing a shared database or data store
- Changing deployment strategy or CI/CD approach
- Any decision that affects more than one repo

## ADR Lifecycle

```
Proposed → Accepted → [Superseded by ADR-XXX | Deprecated]
```

- **Proposed**: Under discussion, open for feedback
- **Accepted**: Decision is made and in effect
- **Superseded**: A newer ADR replaces this one (link to the new ADR)
- **Deprecated**: Decision is no longer relevant (system has changed)

## How to Create an ADR

1. Copy `TEMPLATE.md` to a new file: `short-title.md` (kebab-case, no number prefix)
2. Fill in all sections
3. Open a PR for review
4. Once approved, merge and update status to "Accepted"

## Index

| # | Title | Status | Date |
|---|-------|--------|------|
| [000](000-adopt-adr-process.md) | Adopt ADR Process | Accepted | 2026-02-18 |
| [001](001-auto-create-user-profile-unified-feed.md) | Auto-Create User Profile for Unified Feed | Live | 2026-02-18 |
| [002](002-ads-data-dictionary-renaming.md) | Ads Data Dictionary — Field Renaming & Placement Type Refactor | Live | 2026-02-19 |
| [003](003-user-identity-resolution.md) | User Identity Resolution & Progressive Enrichment | Proposed | 2026-02-24 |
| [004](004-amp-marketplace-commerce.md) | AMP Marketplace Commerce — Phase 0 Kali Audio MVP | Live | 2026-03-02 |
| [005](005-muso-search-v2.md) | Muso Search v2 — Cross-Platform Search Upgrade | In Progress | 2026-03-02 |
| [006](006-developer-api-monetization.md) | Developer API Monetization — Stripe Billing, Usage Metering & Developer Portal | Proposed | 2026-03-02 |
| [007](007-cloudflare-full-domain-migration.md) | Cloudflare Full-Domain Migration | Proposed | 2026-03-03 |
| [008](008-unified-injection-and-scaling.md) | Unified Injection & Cost-Optimized Scaling to 149M/day | Live | 2026-03-04 |
| [009](009-instagram-audio-discovery.md) | Instagram Audio Discovery & Catalog Linking | Live | 2026-03-04 |
| [011](011-personalized-ad-targeting-profile-and-feed.md) | Personalized Ad Targeting — Profile Page & Following Feed | Live | 2026-03-03 |
| [012](012-eliminate-s3-capture-writes.md) | Eliminate S3 Capture Writes — Direct-to-DB Analytics Pipeline | Live | 2026-03-08 |
| [014](014-remove-profitwell.md) | Remove ProfitWell — Replicate Retain with Stripe + Klaviyo | Proposed | 2026-03-08 |
| [015](015-muso-ads-core-integration.md) | Muso Ads → Core Platform Integration | In Progress | 2026-03-08 |
| [016](016-smart-ad-targeting-profile-selection.md) | Smart Ad Targeting Profile Selection | Live | 2026-03-10 |
| [017](017-domain-migration-credits-to-app.md) | Domain Migration — credits.muso.ai → app.muso.ai | Proposed | 2026-03-10 |
| [018](018-spotify-blended-search-and-instant-onboarding.md) | Spotify Blended Search & Instant Onboarding | Proposed | 2026-03-13 |
| [019](019-company-type-enumeration-overhaul.md) | Company Type Enumeration Overhaul | Proposed | 2026-03-14 |
| [020](020-pdp-pipeline-acceleration-to-realtime.md) | PDP Pipeline Acceleration to Near Real-Time | Proposed | 2026-03-15 |
| [021](021-artist-discovery-pipeline-and-live-onboarding.md) | Artist Discovery Pipeline & Live Onboarding | Proposed | 2026-03-16 |
| [024](024-openclaw-intercom-channel-for-support-supervision.md) | OpenClaw Intercom Channel for Slack-Supervised Support | Proposed | 2026-03-14 |
| — | [Role-Based Authorization via FastAPI Dependencies](rbac-fastapi-dependencies.md) | Proposed | 2026-05-19 |
| — | [Frontend Capabilities via `/users/me` and `can()` Helper](frontend-capabilities-can-helper.md) | Proposed | 2026-05-19 |
