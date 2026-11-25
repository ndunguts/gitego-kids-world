from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Language, User
from app.security import require_roles

router = APIRouter(prefix="/api/v1/languages", tags=["Dynamic Multilingual System"])


class CreateLanguageRequest(BaseModel):
    code: str
    name: str
    native_name: str
    flag_emoji: str = "🌍"


@router.get("")
def list_languages(db: Session = Depends(get_db)):
    langs = (
        db.query(Language)
        .filter(Language.is_active.is_(True))
        .order_by(Language.id.asc())
        .all()
    )
    return [
        {
            "id": l.id,
            "code": l.code,
            "name": l.name,
            "native_name": l.native_name,
            "flag_emoji": l.flag_emoji,
            "is_active": l.is_active,
        }
        for l in langs
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
def add_language(
    req: CreateLanguageRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    code = req.code.lower().strip()
    if db.query(Language).filter((Language.code == code) | (Language.name == req.name)).first():
        raise HTTPException(status_code=400, detail="Language code or name already exists")
    lang = Language(
        code=code,
        name=req.name.upper(),
        native_name=req.native_name,
        flag_emoji=req.flag_emoji,
        is_active=True,
    )
    db.add(lang)
    db.commit()
    db.refresh(lang)
    return {
        "id": lang.id,
        "code": lang.code,
        "name": lang.name,
        "native_name": lang.native_name,
        "flag_emoji": lang.flag_emoji,
        "is_active": lang.is_active,
    }
