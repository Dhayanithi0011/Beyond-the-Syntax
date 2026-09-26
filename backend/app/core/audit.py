"""
Central audit-log writer. Called from any state-changing action worth being
able to reconstruct later for a dispute (see docs/ARCHITECTURE.md section 26
for the canonical action names: LOGIN, QUIZ_SUBMITTED, ROUND2_ACCESS_GRANTED,
MEMBER_HANDOFF, ADMIN_ACTION, etc).
"""
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AuditLog


async def log_action(
    db: AsyncSession,
    *,
    user_id=None,
    action: str,
    metadata: dict | None = None,
    ip_address: str | None = None,
    commit: bool = True,
) -> None:
    db.add(AuditLog(user_id=user_id, action=action, metadata_=metadata or {}, ip_address=ip_address))
    if commit:
        await db.commit()
