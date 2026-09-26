"""Shared API error type.

Defined outside `app.core.security` because `security` and `services` depend
on each other (security guards call relay_service.sync_team_session_state,
relay_service raises AuthError) — a dedicated module avoids the import cycle.
"""
from fastapi import HTTPException, status


class AuthError(HTTPException):
    def __init__(self, code: str, message: str, status_code: int = status.HTTP_403_FORBIDDEN):
        super().__init__(status_code=status_code, detail={"error": code, "message": message})