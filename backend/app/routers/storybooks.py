import json
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Achievement,
    ActivityLog,
    Bookmark,
    ChildAchievement,
    Reward,
    Storybook,
    StorybookPage,
    StorybookTranslation,
    User,
)
from app.routers.children import resolve_active_child
from app.security import get_current_user, require_roles
from app.services.story_illustrator import (
    generate_and_save_story_illustration,
    needs_ai_illustration,
)

router = APIRouter(prefix="/api/v1/storybooks", tags=["Storybook Studio & Child Reader"])


class GenerateIllustrationRequest(BaseModel):
    text_content: str
    title: str = ""
    page_number: int = 1
    story_context: str = ""


class PageInput(BaseModel):
    page_number: int
    text_content: str
    illustration_url: str = ""
    auto_generate_illustration: bool = False
    layout_style: str = "top-illustration"
    audio_narration_url: Optional[str] = None
    vocabulary: list[dict] = []
    interactive_question: Optional[dict] = None


class CreateStorybookRequest(BaseModel):
    title: str
    description: str
    cover_image: str = "📖"
    author: str = "Gitego Story Team"
    language_code: str = "rw"  # rw (KINYARWANDA), fr (FRENCH), sw (SWAHILI), or dynamic
    category_name: str = "Folktales & Stories"
    age_group: str = "6-8"
    difficulty: str = "Easy"
    status: str = "Draft"
    translation_group_id: Optional[str] = None
    linked_source_book_id: Optional[int] = None
    pages: list[PageInput] = []


class UpdateStorybookRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cover_image: Optional[str] = None
    author: Optional[str] = None
    language_code: Optional[str] = None
    category_name: Optional[str] = None
    age_group: Optional[str] = None
    difficulty: Optional[str] = None
    status: Optional[str] = None


class SavePagesRequest(BaseModel):
    pages: list[PageInput]


class LinkTranslationRequest(BaseModel):
    source_book_id: int
    translated_book_id: int


class UpdateReadingProgressRequest(BaseModel):
    child_id: Optional[int] = None
    last_page_number: int
    completed: bool = False
    is_bookmarked: bool = True


def _serialize_storybook(b: Storybook, db: Session, include_pages: bool = True) -> dict:
    linked_translations = []
    if b.translation_group_id:
        siblings = (
            db.query(Storybook)
            .filter(
                Storybook.translation_group_id == b.translation_group_id,
                Storybook.id != b.id,
            )
            .all()
        )
        linked_translations = [
            {
                "id": sb.id,
                "title": sb.title,
                "language_code": sb.language_code,
                "status": sb.status,
            }
            for sb in siblings
        ]

    first_page_img = None
    pages_list = sorted(b.pages, key=lambda x: x.page_number)
    full_story_context = f"{b.description} " + " ".join(pg.text_content for pg in pages_list)
    dirty = False
    for p in pages_list:
        if needs_ai_illustration(p.illustration_url):
            p.illustration_url = generate_and_save_story_illustration(
                text=p.text_content,
                title=b.title,
                page_number=p.page_number,
                story_context=full_story_context,
            )
            dirty = True
        if first_page_img is None:
            first_page_img = p.illustration_url
    if dirty:
        db.commit()

    cover_is_img = bool(
        b.cover_image
        and b.cover_image.strip().startswith(("/uploads/", "http://", "https://", "data:image/"))
    )
    cover_photo_url = b.cover_image.strip() if cover_is_img else first_page_img

    data = {
        "id": b.id,
        "title": b.title,
        "description": b.description,
        "cover_image": b.cover_image,
        "cover_illustration_url": cover_photo_url,
        "author": b.author,
        "language_code": b.language_code,
        "category_name": b.category_name,
        "age_group": b.age_group,
        "difficulty": b.difficulty,
        "status": b.status,
        "translation_group_id": b.translation_group_id,
        "linked_translations": linked_translations,
        "read_count": b.read_count,
        "page_count": len(pages_list),
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }
    if include_pages:
        data["pages"] = [
            {
                "id": p.id,
                "page_number": p.page_number,
                "text_content": p.text_content,
                "illustration_url": p.illustration_url,
                "layout_style": p.layout_style,
                "audio_narration_url": p.audio_narration_url,
                "vocabulary": json.loads(p.vocabulary_json or "[]"),
                "interactive_question": (
                    json.loads(p.interactive_question_json)
                    if p.interactive_question_json
                    else None
                ),
            }
            for p in pages_list
        ]
    return data


@router.post("/generate-illustration")
def generate_ai_page_illustration(
    req: GenerateIllustrationRequest,
    user: User = Depends(get_current_user),
):
    """Automatically generate an AI story illustration SVG matching the written story text."""
    url = generate_and_save_story_illustration(
        text=req.text_content or req.title or "Inkuru y'abana",
        title=req.title,
        page_number=req.page_number,
        story_context=req.story_context,
    )
    return {
        "illustration_url": url,
        "page_number": req.page_number,
        "generated_by": "Gitego Story AI Illustrator v2",
    }


@router.get("")
def list_storybooks(
    language_code: Optional[str] = None,
    category: Optional[str] = None,
    age_group: Optional[str] = None,
    include_drafts: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(Storybook)
    if not include_drafts:
        q = q.filter(Storybook.status == "Published")
    if language_code:
        q = q.filter(Storybook.language_code == language_code)
    if category:
        q = q.filter(Storybook.category_name.ilike(f"%{category}%"))
    if age_group:
        q = q.filter(Storybook.age_group == age_group)
    books = q.order_by(Storybook.id.asc()).all()
    return [_serialize_storybook(b, db, include_pages=False) for b in books]


@router.get("/bookshelf")
def get_child_bookshelf(
    child_id: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    effective_role = getattr(user, "_token_role", user.role_name)
    is_preview = effective_role in ("PARENT", "SUPER_ADMIN", "CONTENT_ADMIN") and child_id is None
    all_books = db.query(Storybook).filter(Storybook.status == "Published").all()
    if is_preview:
        child = None
        bm_map = {}
    else:
        child = resolve_active_child(child_id, user, db)
        bookmarks = db.query(Bookmark).filter(Bookmark.child_id == child.id).all()
        bm_map = {bm.storybook_id: bm for bm in bookmarks}

    by_language: dict[str, list] = {}
    by_age_group: dict[str, list] = {}
    recently_opened = []
    completed_books = []

    for b in all_books:
        serialized = _serialize_storybook(b, db, include_pages=False)
        bm = bm_map.get(b.id)
        if bm:
            serialized["last_page_number"] = bm.last_page_number
            serialized["completed"] = bm.completed
            serialized["is_bookmarked"] = bm.is_bookmarked
            recently_opened.append(serialized)
            if bm.completed:
                completed_books.append(serialized)
        by_language.setdefault(b.language_code, []).append(serialized)
        by_age_group.setdefault(b.age_group, []).append(serialized)

    return {
        "recently_opened": recently_opened,
        "completed_books": completed_books,
        "recommended_books": [_serialize_storybook(b, db, include_pages=False) for b in all_books[:6]],
        "by_language": by_language,
        "by_age_group": by_age_group,
    }


@router.get("/{storybook_id}")
def get_storybook(storybook_id: int, db: Session = Depends(get_db)):
    b = db.query(Storybook).filter(Storybook.id == storybook_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Storybook not found")
    return _serialize_storybook(b, db, include_pages=True)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_storybook(
    req: CreateStorybookRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    group_id = req.translation_group_id
    source_book = None
    if req.linked_source_book_id:
        source_book = db.query(Storybook).filter(Storybook.id == req.linked_source_book_id).first()
        if source_book:
            if not source_book.translation_group_id:
                source_book.translation_group_id = f"story-group-{source_book.id}"
            group_id = source_book.translation_group_id

    if not group_id:
        group_id = f"story-group-{uuid.uuid4().hex[:8]}"

    book = Storybook(
        title=req.title,
        description=req.description,
        cover_image=req.cover_image,
        author=req.author,
        language_code=req.language_code,
        category_name=req.category_name,
        age_group=req.age_group,
        difficulty=req.difficulty,
        status=req.status,
        translation_group_id=group_id,
        created_by_id=admin.id,
    )
    db.add(book)
    db.flush()

    if source_book:
        db.add(
            StorybookTranslation(
                translation_group_id=group_id,
                source_book_id=source_book.id,
                translated_book_id=book.id,
                language_code=book.language_code,
            )
        )

    pages_to_add = req.pages or [
        PageInput(
            page_number=1,
            text_content=req.description or f"{req.title} — Page 1",
            illustration_url="",
        )
    ]
    full_ctx = f"{book.description} " + " ".join(pg.text_content for pg in pages_to_add)
    for p in pages_to_add:
        illus_url = (p.illustration_url or "").strip()
        if not illus_url and p.auto_generate_illustration:
            illus_url = generate_and_save_story_illustration(
                text=p.text_content,
                title=book.title,
                page_number=p.page_number,
                story_context=full_ctx,
            )
        elif not illus_url:
            illus_url = book.cover_image or "/uploads/story_illustrations/default.svg"
        db.add(
            StorybookPage(
                storybook_id=book.id,
                page_number=p.page_number,
                text_content=p.text_content,
                illustration_url=illus_url,
                layout_style=p.layout_style,
                audio_narration_url=p.audio_narration_url,
                vocabulary_json=json.dumps(p.vocabulary),
                interactive_question_json=(
                    json.dumps(p.interactive_question) if p.interactive_question else None
                ),
            )
        )

    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="CREATE_STORYBOOK",
            resource_type="storybook",
            resource_id=str(book.id),
            summary=f"Created storybook '{book.title}' ({book.language_code})",
        )
    )
    db.commit()
    db.refresh(book)
    return _serialize_storybook(book, db, include_pages=True)


@router.patch("/{storybook_id}")
def update_storybook(
    storybook_id: int,
    req: UpdateStorybookRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    book = db.query(Storybook).filter(Storybook.id == storybook_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Storybook not found")
    if req.status is not None and req.status not in {"Draft", "Review", "Published", "Archived"}:
        raise HTTPException(status_code=400, detail="Invalid storybook status")
    for field in [
        "title",
        "description",
        "cover_image",
        "author",
        "language_code",
        "category_name",
        "age_group",
        "difficulty",
        "status",
    ]:
        val = getattr(req, field)
        if val is not None:
            setattr(book, field, val)
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="UPDATE_STORYBOOK",
            resource_type="storybook",
            resource_id=str(book.id),
            summary=f"Updated storybook '{book.title}'",
        )
    )
    db.commit()
    db.refresh(book)
    return _serialize_storybook(book, db, include_pages=True)


@router.post("/{storybook_id}/archive")
def archive_storybook(
    storybook_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    book = db.query(Storybook).filter(Storybook.id == storybook_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Storybook not found")
    book.status = "Archived"
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="ARCHIVE_STORYBOOK",
            resource_type="storybook",
            resource_id=str(book.id),
            summary=f"Archived storybook '{book.title}'",
        )
    )
    db.commit()
    db.refresh(book)
    return _serialize_storybook(book, db, include_pages=False)


@router.post("/{storybook_id}/duplicate", status_code=status.HTTP_201_CREATED)
def duplicate_storybook(
    storybook_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    src = db.query(Storybook).filter(Storybook.id == storybook_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Storybook not found")

    clone = Storybook(
        title=f"{src.title} (Copy)",
        description=src.description,
        cover_image=src.cover_image,
        author=src.author,
        language_code=src.language_code,
        category_name=src.category_name,
        age_group=src.age_group,
        difficulty=src.difficulty,
        status="Draft",
        translation_group_id=f"story-group-{uuid.uuid4().hex[:8]}",
        created_by_id=admin.id,
    )
    db.add(clone)
    db.flush()

    for p in sorted(src.pages, key=lambda x: x.page_number):
        db.add(
            StorybookPage(
                storybook_id=clone.id,
                page_number=p.page_number,
                text_content=p.text_content,
                illustration_url=p.illustration_url,
                layout_style=p.layout_style,
                audio_narration_url=p.audio_narration_url,
                vocabulary_json=p.vocabulary_json,
                interactive_question_json=p.interactive_question_json,
            )
        )

    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="DUPLICATE_STORYBOOK",
            resource_type="storybook",
            resource_id=str(clone.id),
            summary=f"Duplicated storybook '{src.title}' as '{clone.title}'",
        )
    )
    db.commit()
    db.refresh(clone)
    return _serialize_storybook(clone, db, include_pages=True)


@router.delete("/{storybook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_storybook(
    storybook_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    book = db.query(Storybook).filter(Storybook.id == storybook_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Storybook not found")

    title = book.title
    db.query(StorybookTranslation).filter(
        (StorybookTranslation.source_book_id == book.id)
        | (StorybookTranslation.translated_book_id == book.id)
    ).delete(synchronize_session=False)

    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="DELETE_STORYBOOK",
            resource_type="storybook",
            resource_id=str(book.id),
            summary=f"Deleted storybook '{title}'",
        )
    )
    db.delete(book)
    db.commit()


@router.put("/{storybook_id}/pages")
def save_storybook_pages(
    storybook_id: int,
    req: SavePagesRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    book = db.query(Storybook).filter(Storybook.id == storybook_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Storybook not found")

    db.query(StorybookPage).filter(StorybookPage.storybook_id == book.id).delete()
    db.flush()

    full_ctx = f"{book.description} " + " ".join(pg.text_content for pg in req.pages)
    for idx, p in enumerate(req.pages, start=1):
        pnum = p.page_number or idx
        illus_url = (p.illustration_url or "").strip()
        if not illus_url and p.auto_generate_illustration:
            illus_url = generate_and_save_story_illustration(
                text=p.text_content,
                title=book.title,
                page_number=pnum,
                story_context=full_ctx,
            )
        db.add(
            StorybookPage(
                storybook_id=book.id,
                page_number=pnum,
                text_content=p.text_content,
                illustration_url=illus_url,
                layout_style=p.layout_style,
                audio_narration_url=p.audio_narration_url,
                vocabulary_json=json.dumps(p.vocabulary),
                interactive_question_json=(
                    json.dumps(p.interactive_question) if p.interactive_question else None
                ),
            )
        )
    db.commit()
    db.refresh(book)
    return _serialize_storybook(book, db, include_pages=True)


@router.post("/{storybook_id}/publish")
def publish_storybook(
    storybook_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    book = db.query(Storybook).filter(Storybook.id == storybook_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Storybook not found")
    if len(book.pages) == 0:
        raise HTTPException(status_code=400, detail="Cannot publish a storybook with zero pages")
    book.status = "Published"
    db.commit()
    db.refresh(book)
    return _serialize_storybook(book, db, include_pages=True)


@router.post("/translations/link")
def link_storybook_translations(
    req: LinkTranslationRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    src = db.query(Storybook).filter(Storybook.id == req.source_book_id).first()
    dst = db.query(Storybook).filter(Storybook.id == req.translated_book_id).first()
    if not src or not dst:
        raise HTTPException(status_code=404, detail="Source or translated book not found")

    group_id = src.translation_group_id or dst.translation_group_id or f"story-group-{src.id}"
    src.translation_group_id = group_id
    dst.translation_group_id = group_id

    existing = (
        db.query(StorybookTranslation)
        .filter(
            StorybookTranslation.source_book_id == src.id,
            StorybookTranslation.translated_book_id == dst.id,
        )
        .first()
    )
    if not existing:
        db.add(
            StorybookTranslation(
                translation_group_id=group_id,
                source_book_id=src.id,
                translated_book_id=dst.id,
                language_code=dst.language_code,
            )
        )
    db.commit()
    return {
        "linked": True,
        "translation_group_id": group_id,
        "source_book": _serialize_storybook(src, db, include_pages=False),
        "translated_book": _serialize_storybook(dst, db, include_pages=False),
    }


@router.post("/{storybook_id}/progress")
def update_reading_progress(
    storybook_id: int,
    req: UpdateReadingProgressRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    book = db.query(Storybook).filter(Storybook.id == storybook_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Storybook not found")

    child = resolve_active_child(req.child_id, user, db)
    bm = (
        db.query(Bookmark)
        .filter(Bookmark.child_id == child.id, Bookmark.storybook_id == book.id)
        .first()
    )
    if not bm:
        bm = Bookmark(
            child_id=child.id,
            storybook_id=book.id,
            last_page_number=req.last_page_number,
            completed=req.completed,
            is_bookmarked=req.is_bookmarked,
        )
        book.read_count += 1
        db.add(bm)
    else:
        bm.last_page_number = req.last_page_number
        bm.completed = bm.completed or req.completed
        bm.is_bookmarked = req.is_bookmarked

    stars_awarded = 0
    if req.completed:
        claim_key = f"book_completed:{book.id}"
        existing_reward = (
            db.query(Reward)
            .filter(Reward.child_id == child.id, Reward.claim_key == claim_key)
            .first()
        )
        if not existing_reward:
            stars_awarded = 5
            child.total_stars += stars_awarded
            child.current_level = 1 + (child.total_stars // 15)
            db.add(
                Reward(
                    child_id=child.id,
                    activity_type="book_completed",
                    reference_id=str(book.id),
                    claim_key=claim_key,
                    stars_earned=stars_awarded,
                    badge_name="Story Reader 📖",
                )
            )
            ach = db.query(Achievement).filter(Achievement.code == "BOOKWORM").first()
            if ach:
                has_ach = (
                    db.query(ChildAchievement)
                    .filter(
                        ChildAchievement.child_id == child.id,
                        ChildAchievement.achievement_id == ach.id,
                    )
                    .first()
                )
                if not has_ach:
                    db.add(ChildAchievement(child_id=child.id, achievement_id=ach.id))

    db.commit()
    return {
        "storybook_id": book.id,
        "child_id": child.id,
        "last_page_number": bm.last_page_number,
        "completed": bm.completed,
        "stars_awarded": stars_awarded,
        "child_total_stars": child.total_stars,
    }
