import os
from dataclasses import dataclass, field


@dataclass
class Settings:
    PROJECT_NAME: str = "GITEGO KIDS WORLD"
    TAGLINE: str = "Play • Watch • Read • Learn • Explore"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL",
            f"sqlite:///{os.path.join(os.path.dirname(os.path.dirname(__file__)), 'gitego_kids_world.db')}",
        )
    )
    JWT_SECRET_KEY: str = field(
        default_factory=lambda: os.getenv(
            "JWT_SECRET_KEY",
            "gitego-kids-world-dev-secret-key-change-in-production-2026",
        )
    )
    JWT_REFRESH_SECRET_KEY: str = field(
        default_factory=lambda: os.getenv(
            "JWT_REFRESH_SECRET_KEY",
            "gitego-kids-world-refresh-secret-key-change-in-production-2026",
        )
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

    # S3-compatible object storage / local fallback settings
    S3_ENDPOINT_URL: str = os.getenv("S3_ENDPOINT_URL", "http://localhost:9000")
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "gitego-kids-media")
    S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY", "")
    S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY", "")
    S3_REGION: str = os.getenv("S3_REGION", "us-east-1")
    UPLOAD_DIR: str = os.getenv(
        "UPLOAD_DIR",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads"),
    )
    MAX_UPLOAD_SIZE_BYTES: int = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(10 * 1024 * 1024)))
    ALLOWED_IMAGE_TYPES: tuple = ("image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif")
    ALLOWED_AUDIO_TYPES: tuple = ("audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg")
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "240"))


settings = Settings()
