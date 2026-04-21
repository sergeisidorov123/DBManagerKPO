import os
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker, scoped_session, declarative_base
from sqlalchemy import create_engine

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@db:5432/guitardb",
)

engine = create_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = scoped_session(sessionmaker(bind=engine, autoflush=False, autocommit=False))
Base = declarative_base()

def init_db():
    Base.metadata.create_all(bind=engine)
    # Ensure there's at least one admin if users exist but no admin flag set
    with engine.begin() as conn:
        try:
            cnt = conn.execute(text("SELECT COUNT(*) FROM users WHERE is_admin = TRUE")).scalar()
        except Exception:
            cnt = None
        if cnt is not None and cnt == 0:
            # pick the earliest user (lowest id) and promote to admin
            row = conn.execute(text("SELECT id FROM users ORDER BY id LIMIT 1")).fetchone()
            if row:
                conn.execute(text("UPDATE users SET is_admin = TRUE WHERE id = :id"), {"id": row[0]})
