# ADR 0036: Revalidate mutable development assets

Status: accepted for development, 2026-10-16.

## Context

The loopback browser shell refers to stable JavaScript and CSS URLs. After a UI change and service restart, Chromium used an older cached `app.js` on an ordinary reload, obscuring the new Reprocess transcript control. A forced no-cache reload fetched the changed file. Serving ETag and Last-Modified alone does not require every ordinary reload to revalidate.

## Decision

For the development service, serve `/static/` and `/shared/` with `Cache-Control: private, no-cache`. The browser can retain an asset but must revalidate it; unchanged files can return 304. Serve the workspace HTML routes with `no-store` so a direct link loads the current shell. Leave API and media cache policies to their existing route-specific behavior.

This is a local development policy. A packaged production build can later use content-hashed asset names and long immutable caching, but that requires a build manifest and release process that the current server does not have.

## Verification and limits

In a separate loopback browser service, a temporary script changed from one value to another at the same URL. An ordinary Chromium reload loaded the new value with caching enabled. The development HTML returned `no-store`; mutable shared and static files returned `private, no-cache`. The temporary tab, script, and service data were removed. This does not measure production CDN behavior.
