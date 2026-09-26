from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api import auth, quiz, teams, coding, admin, leaderboard, public

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(public.router, prefix="/api/v1")
app.include_router(quiz.router, prefix="/api/v1")
app.include_router(teams.router, prefix="/api/v1")
app.include_router(coding.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(leaderboard.router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health():
    return {"status": "ok", "environment": settings.environment}

# WebSocket routes (/ws/team/{id}, /ws/leaderboard/{round}, /ws/admin/live) are
# registered from app/websocket once the connection-manager is wired in Phase 12.
