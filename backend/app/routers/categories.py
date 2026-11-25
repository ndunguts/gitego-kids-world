from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Game, GameCategory, LearningSubject, Storybook, User, Video
from app.security import require_roles

router = APIRouter(prefix="/api/v1/categories", tags=["Dynamic Categories"])


class CreateCategoryRequest(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    content_type: str = "all"  # all, game, storybook, video, learning
    icon: str = "🌟"
    color: str = "#38bdf8"


class UpdateCategoryRequest(BaseModel):
    slug: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    content_type: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


@router.get("")
def list_categories(content_type: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Category).filter(Category.is_active.is_(True))
    if content_type and content_type != "all":
        q = q.filter((Category.content_type == content_type) | (Category.content_type == "all"))
    cats = q.order_by(Category.id.asc()).all()
    return [
        {
            "id": c.id,
            "slug": c.slug,
            "name": c.name,
            "description": c.description,
            "content_type": c.content_type,
            "icon": c.icon,
            "color": c.color,
            "is_active": c.is_active,
        }
        for c in cats
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_category(
    req: CreateCategoryRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    if db.query(Category).filter(Category.slug == req.slug).first():
        raise HTTPException(status_code=400, detail="Category slug already exists")
    cat = Category(
        slug=req.slug,
        name=req.name,
        description=req.description,
        content_type=req.content_type,
        icon=req.icon,
        color=req.color,
        is_active=True,
    )
    db.add(cat)
    if req.content_type in {"game", "all"}:
        if not db.query(GameCategory).filter(GameCategory.slug == req.slug).first():
            db.add(
                GameCategory(
                    slug=req.slug,
                    name=req.name,
                    description=req.description,
                    icon=req.icon,
                )
            )
    if req.content_type in {"learning", "all"}:
        if not db.query(LearningSubject).filter(LearningSubject.slug == req.slug).first():
            db.add(
                LearningSubject(
                    slug=req.slug,
                    name=req.name,
                    description=req.description or req.name,
                    icon=req.icon or "🧠",
                    color=req.color or "#6366f1",
                    language_code="rw",
                    is_active=True,
                )
            )
    db.commit()
    db.refresh(cat)
    return {
        "id": cat.id,
        "slug": cat.slug,
        "name": cat.name,
        "description": cat.description,
        "content_type": cat.content_type,
        "icon": cat.icon,
        "color": cat.color,
    }


@router.patch("/{category_id}")
def update_category(
    category_id: int,
    req: UpdateCategoryRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    old_slug = cat.slug
    old_name = cat.name
    if req.slug is not None:
        new_slug = req.slug.strip()
        if not new_slug:
            raise HTTPException(status_code=400, detail="Slug cannot be empty")
        if new_slug != old_slug and db.query(Category).filter(Category.slug == new_slug).first():
            raise HTTPException(status_code=400, detail="Category slug already exists")
        cat.slug = new_slug
    if req.content_type is not None:
        if req.content_type not in {"all", "game", "storybook", "video", "learning"}:
            raise HTTPException(status_code=400, detail="Invalid content_type")
        cat.content_type = req.content_type
    for field in ["name", "description", "icon", "color"]:
        val = getattr(req, field)
        if val is not None:
            setattr(cat, field, val)

    # Propagate category rename to existing Games, Storybooks, and Videos
    if old_name != cat.name:
        db.query(Game).filter(Game.category_name == old_name).update({"category_name": cat.name})
        db.query(Storybook).filter(Storybook.category_name == old_name).update({"category_name": cat.name})
        db.query(Video).filter(Video.category_name == old_name).update({"category_name": cat.name})

    # Sync GameCategory (add/update if game/all; remove if moved away from game/all)
    gcat = db.query(GameCategory).filter(GameCategory.slug == old_slug).first()
    if cat.content_type in {"game", "all"}:
        if gcat:
            gcat.slug = cat.slug
            gcat.name = cat.name
            gcat.description = cat.description
            gcat.icon = cat.icon
        elif not db.query(GameCategory).filter(GameCategory.slug == cat.slug).first():
            db.add(GameCategory(slug=cat.slug, name=cat.name, description=cat.description, icon=cat.icon))
    elif gcat:
        db.delete(gcat)

    # Sync LearningSubject (add/update/activate if learning/all; deactivate if moved away)
    lsubj = db.query(LearningSubject).filter(LearningSubject.slug == old_slug).first()
    if cat.content_type in {"learning", "all"}:
        if lsubj:
            lsubj.slug = cat.slug
            lsubj.name = cat.name
            lsubj.description = cat.description or cat.name
            lsubj.icon = cat.icon or "🧠"
            lsubj.color = cat.color or "#6366f1"
            lsubj.is_active = True
        else:
            existing_target = db.query(LearningSubject).filter(LearningSubject.slug == cat.slug).first()
            if existing_target:
                existing_target.name = cat.name
                existing_target.description = cat.description or cat.name
                existing_target.icon = cat.icon or "🧠"
                existing_target.color = cat.color or "#6366f1"
                existing_target.is_active = True
            else:
                db.add(
                    LearningSubject(
                        slug=cat.slug,
                        name=cat.name,
                        description=cat.description or cat.name,
                        icon=cat.icon or "🧠",
                        color=cat.color or "#6366f1",
                        language_code="rw",
                        is_active=True,
                    )
                )
    elif lsubj:
        lsubj.is_active = False

    db.commit()
    db.refresh(cat)
    return {
        "id": cat.id,
        "slug": cat.slug,
        "name": cat.name,
        "description": cat.description,
        "content_type": cat.content_type,
        "icon": cat.icon,
        "color": cat.color,
        "is_active": cat.is_active,
    }


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    # Deactivate any matching LearningSubject without deleting existing lessons
    lsubj = db.query(LearningSubject).filter(LearningSubject.slug == cat.slug).first()
    if lsubj:
        lsubj.is_active = False
    gcat = db.query(GameCategory).filter(GameCategory.slug == cat.slug).first()
    if gcat:
        db.delete(gcat)
    db.delete(cat)
    db.commit()
    return {"deleted": True, "id": category_id}
