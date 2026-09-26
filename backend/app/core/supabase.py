"""
Supabase access-token verification.

Supabase access tokens are JWTs whose `sub` claim is the `auth.users` UUID.
They come in these shapes:

  - HS256 — legacy tokens signed with the project's JWT secret
  - RS256 / ES256 / PS256 — current tokens signed by Supabase's JWKS endpoint
            ({url}/auth/v1/.well-known/jwks.json)

The resolved `sub` is the value we store in `users.auth_uid`, so this module
is the single place that owns how a Supabase token maps to our rows.
"""
import time

import httpx
from jose import jwk, jwt
from jose.exceptions import JWTError

from app.core.config import settings

_JWKS_TTL_SECONDS = 3600
_jwks_cache: dict | None = None
_jwks_cached_at: float = 0.0


class SupabaseAuthError(Exception):
    """Raised for invalid / unsupported / unverifiable Supabase tokens."""


def _jwks_url() -> str:
    if not settings.supabase_url:
        raise SupabaseAuthError("Supabase URL not configured")
    return f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


async def fetch_jwks(force: bool = False) -> dict:
    """Returns the project's public signing keys. Results are cached for an
    hour; `force` forces a refresh. The client is created per request because
    this runs rarely, so a long-lived pool isn't worth keeping around."""
    global _jwks_cache, _jwks_cached_at
    now = time.time()
    if not force and _jwks_cache is not None and now - _jwks_cached_at < _JWKS_TTL_SECONDS:
        return _jwks_cache

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(_jwks_url())
            resp.raise_for_status()
            payload = resp.json()
    except Exception as exc:
        raise SupabaseAuthError("Failed to fetch Supabase signing keys") from exc

    _jwks_cache = payload
    _jwks_cached_at = now
    return payload


def _public_key(jwks: dict, kid: str | None):
    """Builds the JWK for the key matching the token's `kid`. Works for RSA and
    EC keys (ES256/PS256 tokens come from the same JWKS endpoint)."""
    keys = jwks.get("keys", [])
    if kid:
        for candidate in keys:
            if candidate.get("kid") == kid:
                return jwk.construct(candidate)
    if keys:  # fall back to the only/first key when the kid is missing
        return jwk.construct(keys[0])
    raise SupabaseAuthError("No signing key found in JWKS")


async def verify_access_token(token: str) -> dict:
    """Verifies a Supabase access token and returns its claims. The `sub`
    claim is the auth.users UUID. Raises SupabaseAuthError if unusable."""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise SupabaseAuthError("Token is not a valid JWT") from exc

    alg = header.get("alg")

    if alg == "HS256":
        if not settings.supabase_jwt_secret:
            raise SupabaseAuthError("Supabase JWT secret not configured")
        try:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        except JWTError as exc:
            raise SupabaseAuthError("Token signature invalid or expired") from exc

    if alg in ("RS256", "ES256", "PS256"):
        jwks = await fetch_jwks()
        key = _public_key(jwks, header.get("kid"))
        try:
            return jwt.decode(
                token,
                key,
                algorithms=[alg],
                options={"verify_aud": False},
            )
        except JWTError as exc:
            raise SupabaseAuthError("Token signature invalid or expired") from exc

    raise SupabaseAuthError(f"Unsupported token algorithm: {alg}")