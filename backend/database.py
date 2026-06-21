import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Define base directory of the project
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_DIR = os.path.join(BASE_DIR, "database")

# Ensure the database directory exists
os.makedirs(DB_DIR, exist_ok=True)

# Define SQLite database URL
DATABASE_URL = f"sqlite:///{os.path.join(DB_DIR, 'foodguard.db')}"

# Create SQLAlchemy engine
# "connect_args={'check_same_thread': False}" is required for SQLite in multi-threaded FastAPI apps
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

# Create a SessionLocal class for database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative base class for models
Base = declarative_base()

# Dependency utility to get database session per request
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
