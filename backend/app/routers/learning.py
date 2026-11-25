from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Achievement,
    Answer,
    Category,
    ChildAchievement,
    LearningSubject,
    Lesson,
    Question,
    Quiz,
    Reward,
    User,
)
from app.routers.children import resolve_active_child
from app.security import get_current_user, require_roles

router = APIRouter(prefix="/api/v1/learning", tags=["Learning Center"])

EDUCATION_LEVELS = [
    {"code": "N1", "label": "Materineri 1 (N1)", "cycle": "materineri", "cycle_label": "Materineri (Nursery)"},
    {"code": "N2", "label": "Materineri 2 (N2)", "cycle": "materineri", "cycle_label": "Materineri (Nursery)"},
    {"code": "N3", "label": "Materineri 3 (N3)", "cycle": "materineri", "cycle_label": "Materineri (Nursery)"},
    {"code": "P1", "label": "Primary 1 (P1)", "cycle": "primary", "cycle_label": "Primary (P1–P6)"},
    {"code": "P2", "label": "Primary 2 (P2)", "cycle": "primary", "cycle_label": "Primary (P1–P6)"},
    {"code": "P3", "label": "Primary 3 (P3)", "cycle": "primary", "cycle_label": "Primary (P1–P6)"},
    {"code": "P4", "label": "Primary 4 (P4)", "cycle": "primary", "cycle_label": "Primary (P1–P6)"},
    {"code": "P5", "label": "Primary 5 (P5)", "cycle": "primary", "cycle_label": "Primary (P1–P6)"},
    {"code": "P6", "label": "Primary 6 (P6)", "cycle": "primary", "cycle_label": "Primary (P1–P6)"},
    {"code": "S1", "label": "Senior 1 (S1)", "cycle": "o_level", "cycle_label": "O-Level (S1–S3)"},
    {"code": "S2", "label": "Senior 2 (S2)", "cycle": "o_level", "cycle_label": "O-Level (S1–S3)"},
    {"code": "S3", "label": "Senior 3 (S3)", "cycle": "o_level", "cycle_label": "O-Level (S1–S3)"},
    {"code": "S4", "label": "Senior 4 (S4)", "cycle": "high_school", "cycle_label": "High School (S4–S6)"},
    {"code": "S5", "label": "Senior 5 (S5)", "cycle": "high_school", "cycle_label": "High School (S4–S6)"},
    {"code": "S6", "label": "Senior 6 (S6)", "cycle": "high_school", "cycle_label": "High School (S4–S6)"},
]
GRADE_TO_LEVEL = {lv["code"]: lv for lv in EDUCATION_LEVELS}
VALID_CONTENT_TYPES = {"lesson", "exam"}


def _serialize_lesson(l: Lesson) -> dict:
    lv = GRADE_TO_LEVEL.get(l.grade_level or "P1", GRADE_TO_LEVEL["P1"])
    return {
        "id": l.id,
        "subject_id": l.subject_id,
        "subject_name": l.subject.name if l.subject else "",
        "title": l.title,
        "description": l.description,
        "content_body": l.content_body,
        "language_code": l.language_code,
        "age_group": l.age_group,
        "difficulty": l.difficulty,
        "image_url": l.image_url,
        "audio_url": l.audio_url,
        "points_reward": l.points_reward,
        "content_type": l.content_type or "lesson",
        "grade_level": lv["code"],
        "grade_label": lv["label"],
        "education_cycle": lv["cycle"],
        "education_cycle_label": lv["cycle_label"],
        "duration_minutes": l.duration_minutes or 15,
        "status": l.status,
        "quizzes": [
            {
                "id": qz.id,
                "title": qz.title,
                "passing_score": qz.passing_score,
                "questions": [
                    {
                        "id": qu.id,
                        "prompt": qu.prompt,
                        "image_hint": qu.image_hint,
                        "points": qu.points,
                        "answers": [
                            {"id": ans.id, "answer_text": ans.answer_text}
                            for ans in qu.answers
                        ],
                    }
                    for qu in qz.questions
                ],
            }
            for qz in l.quizzes
        ],
    }


@router.get("/levels")
def list_education_levels():
    return EDUCATION_LEVELS


class CreateSubjectRequest(BaseModel):
    slug: str
    name: str
    description: str
    icon: str = "🧠"
    color: str = "#6366f1"
    language_code: str = "rw"


class QuizQuestionInput(BaseModel):
    prompt: str
    image_hint: Optional[str] = None
    points: int = 10
    options: list[str]
    correct_option: str


class CreateLessonRequest(BaseModel):
    subject_id: int
    title: str
    description: str
    content_body: str
    language_code: str = "rw"
    age_group: str = "6-8"
    difficulty: str = "Easy"
    image_url: str = "📚"
    audio_url: Optional[str] = None
    points_reward: int = 10
    content_type: str = "lesson"  # lesson | exam
    grade_level: str = "P1"  # N1..N3, P1..P6, S1..S6
    duration_minutes: int = 15
    quiz_questions: list[QuizQuestionInput] = []


class UpdateLessonRequest(BaseModel):
    subject_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    content_body: Optional[str] = None
    language_code: Optional[str] = None
    age_group: Optional[str] = None
    difficulty: Optional[str] = None
    image_url: Optional[str] = None
    points_reward: Optional[int] = None
    content_type: Optional[str] = None
    grade_level: Optional[str] = None
    duration_minutes: Optional[int] = None
    status: Optional[str] = None


class SubmitQuizRequest(BaseModel):
    child_id: Optional[int] = None
    answers: dict[str, int]  # question_id (str) -> selected answer_id (int)


@router.get("/subjects")
def list_subjects(language_code: Optional[str] = None, db: Session = Depends(get_db)):
    # Auto-sync active 'learning'/'all' Categories into LearningSubject,
    # and ensure categories moved away from learning/all are deactivated.
    all_cats = db.query(Category).filter(Category.is_active.is_(True)).all()
    existing_map = {s.slug: s for s in db.query(LearningSubject).all()}
    synced = False
    for c in all_cats:
        subj = existing_map.get(c.slug)
        if c.content_type in ("learning", "all"):
            if not subj:
                new_s = LearningSubject(
                    slug=c.slug,
                    name=c.name,
                    description=c.description or c.name,
                    icon=c.icon or "🧠",
                    color=c.color or "#6366f1",
                    language_code="rw",
                    is_active=True,
                )
                db.add(new_s)
                existing_map[c.slug] = new_s
                synced = True
            elif not subj.is_active or subj.name != c.name:
                subj.is_active = True
                subj.name = c.name
                subj.icon = c.icon or subj.icon
                synced = True
        elif subj and subj.is_active:
            subj.is_active = False
            synced = True
    if synced:
        db.commit()

    q = db.query(LearningSubject).filter(LearningSubject.is_active.is_(True))
    if language_code:
        q = q.filter(LearningSubject.language_code == language_code)
    subjects = q.order_by(LearningSubject.id.asc()).all()
    return [
        {
            "id": s.id,
            "slug": s.slug,
            "name": s.name,
            "description": s.description,
            "icon": s.icon,
            "color": s.color,
            "language_code": s.language_code,
            "lesson_count": len(s.lessons),
        }
        for s in subjects
    ]


@router.post("/subjects", status_code=status.HTTP_201_CREATED)
def create_subject(
    req: CreateSubjectRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    if db.query(LearningSubject).filter(LearningSubject.slug == req.slug).first():
        raise HTTPException(status_code=400, detail="Subject slug already exists")
    s = LearningSubject(
        slug=req.slug,
        name=req.name,
        description=req.description,
        icon=req.icon,
        color=req.color,
        language_code=req.language_code,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {
        "id": s.id,
        "slug": s.slug,
        "name": s.name,
        "description": s.description,
        "icon": s.icon,
        "color": s.color,
        "language_code": s.language_code,
    }


@router.get("/lessons")
def list_lessons(
    subject_id: Optional[int] = None,
    language_code: Optional[str] = None,
    age_group: Optional[str] = None,
    content_type: Optional[str] = None,
    grade_level: Optional[str] = None,
    education_cycle: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Lesson)
    if subject_id:
        q = q.filter(Lesson.subject_id == subject_id)
    if language_code:
        q = q.filter(Lesson.language_code == language_code)
    if age_group:
        q = q.filter(Lesson.age_group == age_group)
    if content_type in VALID_CONTENT_TYPES:
        q = q.filter(Lesson.content_type == content_type)
    if grade_level and grade_level.upper() in GRADE_TO_LEVEL:
        q = q.filter(Lesson.grade_level == grade_level.upper())
    if education_cycle:
        cycle_codes = [lv["code"] for lv in EDUCATION_LEVELS if lv["cycle"] == education_cycle]
        if cycle_codes:
            q = q.filter(Lesson.grade_level.in_(cycle_codes))
    lessons = q.order_by(Lesson.id.asc()).all()
    return [_serialize_lesson(l) for l in lessons]


@router.post("/lessons", status_code=status.HTTP_201_CREATED)
def create_lesson(
    req: CreateLessonRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    subj = db.query(LearningSubject).filter(LearningSubject.id == req.subject_id).first()
    if not subj:
        raise HTTPException(status_code=404, detail="Learning subject not found")

    ctype = req.content_type.lower() if req.content_type else "lesson"
    if ctype not in VALID_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="content_type must be 'lesson' or 'exam'")
    glevel = (req.grade_level or "P1").upper()
    if glevel not in GRADE_TO_LEVEL:
        raise HTTPException(status_code=400, detail="Invalid grade_level (expected N1–N3, P1–P6, S1–S6)")

    lesson = Lesson(
        subject_id=subj.id,
        title=req.title,
        description=req.description,
        content_body=req.content_body,
        language_code=req.language_code,
        age_group=req.age_group,
        difficulty=req.difficulty,
        image_url=req.image_url or ("📝" if ctype == "exam" else "📚"),
        audio_url=req.audio_url,
        points_reward=req.points_reward,
        content_type=ctype,
        grade_level=glevel,
        duration_minutes=max(1, min(240, req.duration_minutes or 15)),
        status="Published",
    )
    db.add(lesson)
    db.flush()

    if req.quiz_questions:
        passing = max(1, (len(req.quiz_questions) + 1) // 2)
        quiz = Quiz(
            lesson_id=lesson.id,
            title=f"{'Exam' if ctype == 'exam' else 'Practice Quiz'}: {lesson.title}",
            passing_score=passing,
        )
        db.add(quiz)
        db.flush()
        for idx, qq in enumerate(req.quiz_questions, start=1):
            question = Question(
                quiz_id=quiz.id,
                prompt=qq.prompt,
                image_hint=qq.image_hint,
                points=qq.points,
                order_index=idx,
            )
            db.add(question)
            db.flush()
            for opt in qq.options:
                db.add(
                    Answer(
                        question_id=question.id,
                        answer_text=opt,
                        is_correct=(opt == qq.correct_option),
                    )
                )

    db.commit()
    db.refresh(lesson)
    return _serialize_lesson(lesson)


@router.patch("/lessons/{lesson_id}")
def update_lesson(
    lesson_id: int,
    req: UpdateLessonRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson or exam not found")

    if req.content_type is not None:
        ct = req.content_type.lower()
        if ct not in VALID_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail="content_type must be 'lesson' or 'exam'")
        lesson.content_type = ct
    if req.grade_level is not None:
        gl = req.grade_level.upper()
        if gl not in GRADE_TO_LEVEL:
            raise HTTPException(status_code=400, detail="Invalid grade_level")
        lesson.grade_level = gl

    for field in [
        "subject_id",
        "title",
        "description",
        "content_body",
        "language_code",
        "age_group",
        "difficulty",
        "image_url",
        "points_reward",
        "duration_minutes",
        "status",
    ]:
        val = getattr(req, field)
        if val is not None:
            setattr(lesson, field, val)

    db.commit()
    db.refresh(lesson)
    return _serialize_lesson(lesson)


@router.delete("/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lesson(
    lesson_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson or exam not found")
    db.delete(lesson)
    db.commit()


@router.post("/quizzes/{quiz_id}/submit")
def submit_quiz_answers(
    quiz_id: int,
    req: SubmitQuizRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    child = resolve_active_child(req.child_id, user, db)
    correct_count = 0
    total_questions = len(quiz.questions)
    earned_points = 0

    for qu in quiz.questions:
        picked_ans_id = req.answers.get(str(qu.id))
        if picked_ans_id is not None:
            ans = (
                db.query(Answer)
                .filter(Answer.id == picked_ans_id, Answer.question_id == qu.id)
                .first()
            )
            if ans and ans.is_correct:
                correct_count += 1
                earned_points += qu.points

    passed = correct_count >= quiz.passing_score
    stars_awarded = 0
    if passed:
        claim_key = f"quiz_passed:{quiz.id}"
        existing = (
            db.query(Reward)
            .filter(Reward.child_id == child.id, Reward.claim_key == claim_key)
            .first()
        )
        if not existing:
            stars_awarded = 5
            child.total_stars += stars_awarded
            child.current_level = 1 + (child.total_stars // 15)
            db.add(
                Reward(
                    child_id=child.id,
                    activity_type="quiz_passed",
                    reference_id=str(quiz.id),
                    claim_key=claim_key,
                    stars_earned=stars_awarded,
                    badge_name="Quiz Champion 🏆",
                )
            )
            ach = db.query(Achievement).filter(Achievement.code == "QUIZ_CHAMPION").first()
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

    pct = round((correct_count / total_questions) * 100) if total_questions else 0
    return {
        "quiz_id": quiz.id,
        "correct_count": correct_count,
        "total_questions": total_questions,
        "percentage": pct,
        "earned_points": earned_points,
        "passed": passed,
        "stars_awarded": stars_awarded,
        "child_total_stars": child.total_stars,
    }
