import uuid
import enum
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Boolean, ForeignKey, Enum, Text, JSON,
    DateTime, UniqueConstraint, func, text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def uuid_pk():
    return Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class Role(str, enum.Enum):
    admin = "admin"
    participant = "participant"


class Difficulty(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class Option(str, enum.Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"


class CompetitionState(str, enum.Enum):
    draft = "draft"
    registration_open = "registration_open"
    registration_closed = "registration_closed"
    round1_active = "round1_active"
    round1_closed = "round1_closed"
    qualification_done = "qualification_done"
    teams_created = "teams_created"
    round2_active = "round2_active"
    round2_closed = "round2_closed"
    finalized = "finalized"


class AttemptStatus(str, enum.Enum):
    in_progress = "in_progress"
    submitted = "submitted"
    auto_submitted = "auto_submitted"


class QualificationStatus(str, enum.Enum):
    pending = "pending"
    qualified = "qualified"
    not_qualified = "not_qualified"


class TeamStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    paused = "paused"
    completed = "completed"


class SessionStatus(str, enum.Enum):
    not_started = "not_started"
    active = "active"
    completed = "completed"
    expired = "expired"


class SubmissionStatus(str, enum.Enum):
    accepted = "accepted"
    wrong_answer = "wrong_answer"
    compilation_error = "compilation_error"
    runtime_error = "runtime_error"
    tle = "tle"
    mle = "mle"


class User(Base):
    __tablename__ = "users"
    id = uuid_pk()
    auth_uid = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    role = Column(Enum(Role, name="role"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    participant = relationship("Participant", back_populates="user", uselist=False)
    admin = relationship("Admin", back_populates="user", uselist=False)


class Admin(Base):
    __tablename__ = "admins"
    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    permissions = Column(JSON, default=dict)

    user = relationship("User", back_populates="admin")


class Participant(Base):
    __tablename__ = "participants"
    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    participant_code = Column(String, unique=True, nullable=False)
    department = Column(String)
    year = Column(Integer)
    phone = Column(String)
    registered_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="participant")


class Competition(Base):
    __tablename__ = "competitions"
    id = uuid_pk()
    name = Column(String, nullable=False)
    state = Column(Enum(CompetitionState, name="competition_state"), default=CompetitionState.draft, nullable=False)
    round1_duration_seconds = Column(Integer, nullable=False)
    round2_team_duration_seconds = Column(Integer, nullable=False)
    round2_early_handoff_allowed = Column(Boolean, default=True)
    registration_open = Column(Boolean, default=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("admins.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Question(Base):
    __tablename__ = "questions"
    id = uuid_pk()
    competition_id = Column(UUID(as_uuid=True), ForeignKey("competitions.id"), nullable=False)
    text = Column(Text, nullable=False)
    option_a = Column(Text, nullable=False)
    option_b = Column(Text, nullable=False)
    option_c = Column(Text, nullable=False)
    option_d = Column(Text, nullable=False)
    correct_option = Column(Enum(Option, name="option_label"), nullable=False)  # NEVER serialize to participants
    category = Column(String)
    difficulty = Column(Enum(Difficulty, name="difficulty"), default=Difficulty.medium)
    marks = Column(Integer, default=1)
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    __table_args__ = (UniqueConstraint("participant_id", "competition_id"),)
    id = uuid_pk()
    participant_id = Column(UUID(as_uuid=True), ForeignKey("participants.id"), nullable=False)
    competition_id = Column(UUID(as_uuid=True), ForeignKey("competitions.id"), nullable=False)
    question_order = Column(JSON, nullable=False)
    option_order = Column(JSON, nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    deadline = Column(DateTime(timezone=True), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(Enum(AttemptStatus, name="attempt_status"), default=AttemptStatus.in_progress)
    score = Column(Integer, nullable=True)
    correct_count = Column(Integer, nullable=True)
    incorrect_count = Column(Integer, nullable=True)
    qualification_status = Column(Enum(QualificationStatus, name="qualification_status"), default=QualificationStatus.pending)


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"
    id = uuid_pk()
    attempt_id = Column(UUID(as_uuid=True), ForeignKey("quiz_attempts.id"), nullable=False)
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id"), nullable=False)
    selected_option = Column(Enum(Option, name="option_label"), nullable=True)
    is_correct = Column(Boolean, nullable=True)
    answered_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())


class Team(Base):
    __tablename__ = "teams"
    id = uuid_pk()
    competition_id = Column(UUID(as_uuid=True), ForeignKey("competitions.id"), nullable=False)
    name = Column(String, nullable=False)
    color = Column(String, nullable=True)
    icon = Column(String, nullable=True)
    status = Column(Enum(TeamStatus, name="team_status"), default=TeamStatus.pending)
    round2_access = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TeamMember(Base):
    __tablename__ = "team_members"
    __table_args__ = (
        UniqueConstraint("team_id", "member_number"),
        UniqueConstraint("team_id", "participant_id"),
    )
    id = uuid_pk()
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False)
    participant_id = Column(UUID(as_uuid=True), ForeignKey("participants.id"), nullable=False)
    member_number = Column(Integer, nullable=False)  # 1..3, relay order


class TeamSession(Base):
    __tablename__ = "team_sessions"
    id = uuid_pk()
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id"), unique=True, nullable=False)
    team_started_at = Column(DateTime(timezone=True), nullable=True)
    team_deadline = Column(DateTime(timezone=True), nullable=True)
    team_time_used_seconds = Column(Integer, nullable=False, server_default=text("0"))
    current_member_number = Column(Integer, nullable=True)
    member_started_at = Column(DateTime(timezone=True), nullable=True)
    member_deadline = Column(DateTime(timezone=True), nullable=True)
    start_set_index = Column(Integer, nullable=True)      # 0-based question set dealt to this team at start
    completed_rounds = Column(Integer, nullable=True, default=0)  # full 3-member passes finished
    status = Column(Enum(SessionStatus, name="session_status"), default=SessionStatus.not_started)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())


class CodingProblem(Base):
    __tablename__ = "coding_problems"
    id = uuid_pk()
    competition_id = Column(UUID(as_uuid=True), ForeignKey("competitions.id"), nullable=False)
    title = Column(String, nullable=False)
    statement_md = Column(Text, nullable=False)
    constraints_md = Column(Text)
    domain = Column(String)              # e.g. Arrays, Strings, Graphs, DP, Trees ...
    difficulty = Column(String)          # "easy" | "intermediate"
    position = Column(Integer, nullable=False)  # 1..30 -> contest ordering
    max_score = Column(Integer, default=100)
    time_limit_ms = Column(Integer, default=2000)
    memory_limit_mb = Column(Integer, default=256)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TestCase(Base):
    __tablename__ = "test_cases"
    id = uuid_pk()
    problem_id = Column(UUID(as_uuid=True), ForeignKey("coding_problems.id"), nullable=False)
    input = Column(Text, nullable=False)
    expected_output = Column(Text, nullable=False)
    is_sample = Column(Boolean, default=False)  # kept in sync with test_type for legacy readers
    test_type = Column(String, default="hidden")  # "sample" | "direct" (visible) | "hidden" (judge only)
    weight = Column(Integer, default=1)


class CodeDraft(Base):
    __tablename__ = "code_drafts"
    __table_args__ = (UniqueConstraint("team_id", "problem_id"),)
    id = uuid_pk()
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False)
    problem_id = Column(UUID(as_uuid=True), ForeignKey("coding_problems.id"), nullable=False)
    language = Column(String, nullable=False)
    source_code = Column(Text, default="")
    languages = Column(JSON, server_default=text("'{}'"), nullable=False)  # {lang: source_code} kept per language
    last_edited_by = Column(UUID(as_uuid=True), ForeignKey("team_members.id"), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())


class Submission(Base):
    __tablename__ = "submissions"
    id = uuid_pk()
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False)
    problem_id = Column(UUID(as_uuid=True), ForeignKey("coding_problems.id"), nullable=False)
    member_id = Column(UUID(as_uuid=True), ForeignKey("team_members.id"), nullable=False)
    language = Column(String, nullable=False)
    source_code = Column(Text, nullable=False)
    status = Column(Enum(SubmissionStatus, name="submission_status"), nullable=False)
    execution_time_ms = Column(Integer, nullable=True)
    memory_kb = Column(Integer, nullable=True)
    score = Column(Integer, default=0)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())


class LeaderboardEntry(Base):
    """Cached/derived ranking rows, refreshed on submit events. Never populated from
    client-supplied scores — always recomputed from quiz_attempts / submissions."""
    __tablename__ = "leaderboards"
    id = uuid_pk()
    competition_id = Column(UUID(as_uuid=True), ForeignKey("competitions.id"), nullable=False)
    round_number = Column(Integer, nullable=False)
    subject_type = Column(String, nullable=False)  # 'participant' | 'team'
    subject_id = Column(UUID(as_uuid=True), nullable=False)
    score = Column(Integer, nullable=False)
    tiebreak_time_seconds = Column(Integer, nullable=False)
    rank = Column(Integer, nullable=False)
    computed_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = uuid_pk()
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)
    metadata_ = Column("metadata", JSON, default=dict)
    ip_address = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
