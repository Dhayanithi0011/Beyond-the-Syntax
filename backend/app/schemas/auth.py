from pydantic import BaseModel, EmailStr, Field, model_validator


class RegisterParticipantRequest(BaseModel):
    name: str
    email: EmailStr
    participant_code: str
    department: str | None = None
    year: int | None = None
    phone: str | None = None


class SignupRequest(RegisterParticipantRequest):
    """Server-side participant signup (uses the Supabase admin API so accounts
    are created + auto-confirmed without hitting the public signup rate limit).

    `email` is optional ONLY here: a mobile-only registration is allowed — the
    backend synthesises a stable account identity from the register number
    (`<code>@syntax.event`) so the participant can still sign in with their
    register number or phone. Real gmails are validated as usual."""
    password: str = Field(min_length=8, max_length=200)
    email: EmailStr | None = None

    @model_validator(mode="after")
    def _require_contact(self) -> "SignupRequest":
        if self.email is None and not (self.phone or "").strip():
            raise ValueError("Provide either an email or a phone number.")
        return self


class LoginRequest(BaseModel):
    # Accepts a Supabase email OR a participant register number OR a phone —
    # resolved to the account's email so one login form serves admins and
    # participants alike.
    identifier: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=200)


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    user: "MeResponse"


class MeResponse(BaseModel):
    id: str
    role: str
    name: str
    email: str
    # Present only for participants — lets the frontend immediately know
    # whether Round 1 / Round 2 UI applies without a second round trip.
    participant_id: str | None = None
    participant_code: str | None = None
    # Round 1 outcome for participants: pending / qualified / not_qualified.
    # Drives the Round 2 "you've been selected" prompt and team gates.
    qualification_status: str | None = None
