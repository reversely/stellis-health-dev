"""Response headers that limit what a page may load, embed or send, for every route."""
from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path

_STATIC = Path(__file__).parent / "static"
# Video hosts that note embeds (notes-embeds.js) may frame.
_FRAME_HOSTS = "https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com"


def _inline_script_hashes() -> list[str]:
    """Hash each inline <script> block in the HTML pages so the policy allows exactly those."""
    hashes = set()
    for page in sorted(_STATIC.glob("*.html")):
        for body in re.findall(r"<script>(.*?)</script>", page.read_text(), re.DOTALL):
            digest = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
            hashes.add(f"'sha256-{digest}'")
    return sorted(hashes)


CONTENT_SECURITY_POLICY = "; ".join((
    "default-src 'self'",
    "script-src 'self' " + " ".join(_inline_script_hashes()),
    "style-src 'self'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "font-src 'self'",
    f"frame-src {_FRAME_HOSTS}",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
))


def apply(headers, https: bool) -> None:
    """Set the security headers on a response; HSTS only when the site is served over HTTPS."""
    headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("Referrer-Policy", "same-origin")
    headers.setdefault("Permissions-Policy", "microphone=(self), camera=(), geolocation=()")
    if https:
        headers.setdefault("Strict-Transport-Security", "max-age=31536000")
