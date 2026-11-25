import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.database import Base


def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)


# 1. Roles
class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)  # SUPER_ADMIN, CONTENT_ADMIN, PARENT, CHILD
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    users = relationship("User", back_populates="role_rel")


# 2. Users
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    full_name = Column(String(150), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=False)
    role_name = Column(String(50), nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_suspended = Column(Boolean, default=False, nullable=False)
    suspended_until = Column(DateTime(timezone=True), nullable=True)
    suspension_reason = Column(String(255), nullable=True)
    warning_count = Column(Integer, default=0, nullable=False)
    last_active_at = Column(DateTime(timezone=True), nullable=True)
    current_activity = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    role_rel = relationship("Role", back_populates="users")
    parent_profile = relationship("ParentProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    child_profile = relationship("ChildProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")


# 3. ParentProfiles
class ParentProfile(Base):
    __tablename__ = "parent_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    phone_number = Column(String(50), nullable=True)
    parental_consent_given = Column(Boolean, default=False, nullable=False)
    consent_timestamp = Column(DateTime(timezone=True), nullable=True)
    pin_code = Column(String(20), default="1234", nullable=False)
    preferred_language = Column(String(20), default="rw", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="parent_profile")
    child_links = relationship("ParentChildRelationship", back_populates="parent", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="parent", cascade="all, delete-orphan")


# 4. ChildProfiles
class ChildProfile(Base):
    __tablename__ = "child_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    display_name = Column(String(100), nullable=False, index=True)
    avatar = Column(String(100), default="🦁", nullable=False)
    age = Column(Integer, default=7, nullable=False)
    age_group = Column(String(30), default="6-8", nullable=False, index=True)  # 3-5, 6-8, 9-12
    pin_code = Column(String(20), default="0000", nullable=False)
    preferred_language = Column(String(20), default="rw", nullable=False)
    total_stars = Column(Integer, default=0, nullable=False)
    current_level = Column(Integer, default=1, nullable=False)
    daily_goal_Target = Column(Integer, default=3, nullable=False)
    is_private = Column(Boolean, default=True, nullable=False)
    parent_consent_approved = Column(Boolean, default=True, nullable=False)
    is_suspended = Column(Boolean, default=False, nullable=False)
    suspended_until = Column(DateTime(timezone=True), nullable=True)
    suspension_reason = Column(String(255), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    current_activity = Column(String(255), nullable=True)
    active_device_id = Column(String(120), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    user = relationship("User", back_populates="child_profile")
    parent_links = relationship("ParentChildRelationship", back_populates="child", cascade="all, delete-orphan")
    screen_time = relationship("ScreenTimeSetting", back_populates="child", uselist=False, cascade="all, delete-orphan")
    game_sessions = relationship("GameSession", back_populates="child", cascade="all, delete-orphan")
    game_scores = relationship("GameScore", back_populates="child", cascade="all, delete-orphan")
    bookmarks = relationship("Bookmark", back_populates="child", cascade="all, delete-orphan")
    video_sessions = relationship("VideoSession", back_populates="child", cascade="all, delete-orphan")
    rewards = relationship("Reward", back_populates="child", cascade="all, delete-orphan")
    achievements = relationship("ChildAchievement", back_populates="child", cascade="all, delete-orphan")


# 5. ParentChildRelationships
class ParentChildRelationship(Base):
    __tablename__ = "parent_child_relationships"
    __table_args__ = (UniqueConstraint("parent_id", "child_id", name="uq_parent_child"),)

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("parent_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    child_id = Column(Integer, ForeignKey("child_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    relationship_type = Column(String(50), default="Parent/Guardian", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    parent = relationship("ParentProfile", back_populates="child_links")
    child = relationship("ChildProfile", back_populates="parent_links")


# 6. Languages
class Language(Base):
    __tablename__ = "languages"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)  # rw, fr, sw, en
    name = Column(String(100), unique=True, nullable=False)  # KINYARWANDA, FRENCH (FRANÇAIS), SWAHILI (KISWAHILI)
    native_name = Column(String(100), nullable=False)
    flag_emoji = Column(String(20), default="🌍", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# 7. Categories
class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    content_type = Column(String(50), default="all", nullable=False, index=True)  # all, game, storybook, video, learning
    icon = Column(String(30), default="🌟", nullable=False)
    color = Column(String(30), default="#38bdf8", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# 8. GameCategories
class GameCategory(Base):
    __tablename__ = "game_categories"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(30), default="🎮", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    games = relationship("Game", back_populates="game_category_rel")


# 9. Games
class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=False)
    instructions = Column(Text, default="Tap Play to begin!", nullable=False)
    cover_image = Column(String(500), default="🎮", nullable=False)
    category_id = Column(Integer, ForeignKey("game_categories.id", ondelete="SET NULL"), nullable=True)
    category_name = Column(String(100), default="Arcade", nullable=False, index=True)
    age_group = Column(String(30), default="6-8", nullable=False, index=True)  # 3-5, 6-8, 9-12
    difficulty = Column(String(30), default="Easy", nullable=False)  # Easy, Medium, Hard
    supported_languages = Column(String(200), default="rw,fr,sw,en", nullable=False)
    game_engine = Column(String(50), default="HTML5_JS", nullable=False)  # HTML5_JS, PHASER, TYPESCRIPT, PYTHON_PYODIDE
    published_version = Column(String(30), default="1.0.0", nullable=False)
    status = Column(String(30), default="Draft", nullable=False, index=True)  # Draft, Review, Published, Archived
    max_possible_score = Column(Integer, default=1000, nullable=False)
    play_count = Column(Integer, default=0, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    game_category_rel = relationship("GameCategory", back_populates="games")
    project = relationship("GameProject", back_populates="game", uselist=False, cascade="all, delete-orphan")
    versions = relationship("GameVersion", back_populates="game", cascade="all, delete-orphan")
    sessions = relationship("GameSession", back_populates="game", cascade="all, delete-orphan")
    scores = relationship("GameScore", back_populates="game", cascade="all, delete-orphan")


# 10. GameProjects
class GameProject(Base):
    __tablename__ = "game_projects"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), unique=True, nullable=False)
    entry_file = Column(String(120), default="index.html", nullable=False)
    engine_type = Column(String(50), default="HTML5_JS", nullable=False)
    autosave_enabled = Column(Boolean, default=True, nullable=False)
    last_validation_errors = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    game = relationship("Game", back_populates="project")
    files = relationship("GameFile", back_populates="project", cascade="all, delete-orphan")


# 11. GameFiles
class GameFile(Base):
    __tablename__ = "game_files"
    __table_args__ = (UniqueConstraint("project_id", "filename", name="uq_project_filename"),)

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("game_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(150), nullable=False)
    language = Column(String(40), default="javascript", nullable=False)  # html, css, javascript, typescript, python
    content = Column(Text, default="", nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    project = relationship("GameProject", back_populates="files")


# 12. GameVersions
class GameVersion(Base):
    __tablename__ = "game_versions"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(String(30), nullable=False)
    compiled_bundle = Column(Text, nullable=False)
    changelog = Column(Text, nullable=True)
    published_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    game = relationship("Game", back_populates="versions")


# 13. GameSessions
class GameSession(Base):
    __tablename__ = "game_sessions"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True)
    child_id = Column(Integer, ForeignKey("child_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    session_token = Column(String(100), unique=True, nullable=False, index=True)
    duration_seconds = Column(Integer, default=0, nullable=False)
    completed = Column(Boolean, default=False, nullable=False)
    started_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)

    game = relationship("Game", back_populates="sessions")
    child = relationship("ChildProfile", back_populates="game_sessions")


# 14. GameScores
class GameScore(Base):
    __tablename__ = "game_scores"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True)
    child_id = Column(Integer, ForeignKey("child_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(Integer, ForeignKey("game_sessions.id", ondelete="SET NULL"), nullable=True)
    score = Column(Integer, default=0, nullable=False)
    verified = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    game = relationship("Game", back_populates="scores")
    child = relationship("ChildProfile", back_populates="game_scores")


# 15. Storybooks
class Storybook(Base):
    __tablename__ = "storybooks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=False)
    cover_image = Column(String(500), default="📖", nullable=False)
    author = Column(String(150), default="Gitego Story Team", nullable=False)
    language_code = Column(String(20), default="rw", nullable=False, index=True)  # rw, fr, sw, en
    category_name = Column(String(100), default="Folktales", nullable=False, index=True)
    age_group = Column(String(30), default="6-8", nullable=False, index=True)
    difficulty = Column(String(30), default="Easy", nullable=False)
    status = Column(String(30), default="Draft", nullable=False, index=True)  # Draft, Published, Archived
    translation_group_id = Column(String(100), nullable=True, index=True)
    read_count = Column(Integer, default=0, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    pages = relationship("StorybookPage", back_populates="storybook", order_by="StorybookPage.page_number", cascade="all, delete-orphan")
    bookmarks = relationship("Bookmark", back_populates="storybook", cascade="all, delete-orphan")


# 16. StorybookTranslations (links translated versions of the same story together)
class StorybookTranslation(Base):
    __tablename__ = "storybook_translations"
    __table_args__ = (UniqueConstraint("source_book_id", "translated_book_id", name="uq_book_translation_pair"),)

    id = Column(Integer, primary_key=True, index=True)
    translation_group_id = Column(String(100), nullable=False, index=True)
    source_book_id = Column(Integer, ForeignKey("storybooks.id", ondelete="CASCADE"), nullable=False, index=True)
    translated_book_id = Column(Integer, ForeignKey("storybooks.id", ondelete="CASCADE"), nullable=False, index=True)
    language_code = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# 17. StorybookPages
class StorybookPage(Base):
    __tablename__ = "storybook_pages"

    id = Column(Integer, primary_key=True, index=True)
    storybook_id = Column(Integer, ForeignKey("storybooks.id", ondelete="CASCADE"), nullable=False, index=True)
    page_number = Column(Integer, nullable=False)
    text_content = Column(Text, nullable=False)
    illustration_url = Column(String(500), default="🌳🐇✨", nullable=False)
    layout_style = Column(String(50), default="top-illustration", nullable=False)
    audio_narration_url = Column(String(500), nullable=True)
    vocabulary_json = Column(Text, default="[]", nullable=False)  # JSON list of {word, meaning}
    interactive_question_json = Column(Text, nullable=True)  # JSON {question, options, answer}
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    storybook = relationship("Storybook", back_populates="pages")


# 18. Bookmarks (also stores reading progress & resume from last page)
class Bookmark(Base):
    __tablename__ = "bookmarks"
    __table_args__ = (UniqueConstraint("child_id", "storybook_id", name="uq_child_storybook_bookmark"),)

    id = Column(Integer, primary_key=True, index=True)
    child_id = Column(Integer, ForeignKey("child_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    storybook_id = Column(Integer, ForeignKey("storybooks.id", ondelete="CASCADE"), nullable=False, index=True)
    last_page_number = Column(Integer, default=1, nullable=False)
    completed = Column(Boolean, default=False, nullable=False)
    is_bookmarked = Column(Boolean, default=True, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    child = relationship("ChildProfile", back_populates="bookmarks")
    storybook = relationship("Storybook", back_populates="bookmarks")


# 19. Videos
class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=False)
    video_url = Column(String(500), nullable=False)
    embed_url = Column(String(500), nullable=False)
    provider = Column(String(50), default="youtube", nullable=False)  # youtube, vimeo, self_hosted, external_other
    provider_supports_events = Column(Boolean, default=True, nullable=False)
    thumbnail_url = Column(String(500), default="🎬", nullable=False)
    category_name = Column(String(100), default="Cartoons", nullable=False, index=True)
    language_code = Column(String(20), default="rw", nullable=False, index=True)
    age_group = Column(String(30), default="6-8", nullable=False, index=True)
    duration_seconds = Column(Integer, default=180, nullable=False)
    status = Column(String(30), default="Published", nullable=False, index=True)  # Draft, Published, Archived
    view_count = Column(Integer, default=0, nullable=False)
    ad_settings_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    sessions = relationship("VideoSession", back_populates="video", cascade="all, delete-orphan")


# 20. VideoSessions
class VideoSession(Base):
    __tablename__ = "video_sessions"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True)
    child_id = Column(Integer, ForeignKey("child_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    playback_state = Column(String(30), default="started", nullable=False)  # started, paused, resumed, completed
    last_position_seconds = Column(Float, default=0.0, nullable=False)
    active_watch_seconds = Column(Float, default=0.0, nullable=False)
    completed = Column(Boolean, default=False, nullable=False)
    provider_reliable = Column(Boolean, default=True, nullable=False)
    started_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    video = relationship("Video", back_populates="sessions")
    child = relationship("ChildProfile", back_populates="video_sessions")


# 21. LearningSubjects
class LearningSubject(Base):
    __tablename__ = "learning_subjects"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    icon = Column(String(30), default="🧠", nullable=False)
    color = Column(String(30), default="#6366f1", nullable=False)
    language_code = Column(String(20), default="rw", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    lessons = relationship("Lesson", back_populates="subject", cascade="all, delete-orphan")


# 22. Lessons
class Lesson(Base):
    __tablename__ = "lessons"

    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("learning_subjects.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=False)
    content_body = Column(Text, nullable=False)
    language_code = Column(String(20), default="rw", nullable=False, index=True)
    age_group = Column(String(30), default="6-8", nullable=False, index=True)
    difficulty = Column(String(30), default="Easy", nullable=False)
    image_url = Column(String(500), default="📚", nullable=False)
    audio_url = Column(String(500), nullable=True)
    points_reward = Column(Integer, default=10, nullable=False)
    content_type = Column(String(20), default="lesson", nullable=False, index=True)  # lesson, exam
    grade_level = Column(String(20), default="P1", nullable=False, index=True)  # N1..N3, P1..P6, S1..S6
    duration_minutes = Column(Integer, default=15, nullable=False)
    status = Column(String(30), default="Published", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    subject = relationship("LearningSubject", back_populates="lessons")
    quizzes = relationship("Quiz", back_populates="lesson", cascade="all, delete-orphan")


# 23. Quizzes
class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(Integer, primary_key=True, index=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    passing_score = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    lesson = relationship("Lesson", back_populates="quizzes")
    questions = relationship("Question", back_populates="quiz", cascade="all, delete-orphan")


# 24. Questions
class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False, index=True)
    prompt = Column(Text, nullable=False)
    image_hint = Column(String(200), nullable=True)
    points = Column(Integer, default=5, nullable=False)
    order_index = Column(Integer, default=1, nullable=False)

    quiz = relationship("Quiz", back_populates="questions")
    answers = relationship("Answer", back_populates="question", cascade="all, delete-orphan")


# 25. Answers
class Answer(Base):
    __tablename__ = "answers"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False, index=True)
    answer_text = Column(String(300), nullable=False)
    is_correct = Column(Boolean, default=False, nullable=False)

    question = relationship("Question", back_populates="answers")


# 26. Rewards
class Reward(Base):
    __tablename__ = "rewards"
    __table_args__ = (UniqueConstraint("child_id", "claim_key", name="uq_child_reward_claim_key"),)

    id = Column(Integer, primary_key=True, index=True)
    child_id = Column(Integer, ForeignKey("child_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    activity_type = Column(String(50), nullable=False)  # game_completed, book_completed, lesson_completed, quiz_passed
    reference_id = Column(String(100), nullable=False)
    claim_key = Column(String(180), nullable=False, index=True)
    stars_earned = Column(Integer, default=1, nullable=False)
    badge_name = Column(String(120), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    child = relationship("ChildProfile", back_populates="rewards")


# 27. Achievements
class Achievement(Base):
    __tablename__ = "achievements"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(80), unique=True, nullable=False, index=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    badge_icon = Column(String(30), default="🏆", nullable=False)
    stars_threshold = Column(Integer, default=5, nullable=False)
    category = Column(String(50), default="general", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    child_unlocks = relationship("ChildAchievement", back_populates="achievement", cascade="all, delete-orphan")


# 28. ChildAchievements
class ChildAchievement(Base):
    __tablename__ = "child_achievements"
    __table_args__ = (UniqueConstraint("child_id", "achievement_id", name="uq_child_achievement"),)

    id = Column(Integer, primary_key=True, index=True)
    child_id = Column(Integer, ForeignKey("child_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    achievement_id = Column(Integer, ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False, index=True)
    unlocked_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    child = relationship("ChildProfile", back_populates="achievements")
    achievement = relationship("Achievement", back_populates="child_unlocks")


# 29. ActivityLogs
class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    child_id = Column(Integer, ForeignKey("child_profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    action_type = Column(String(80), nullable=False, index=True)
    resource_type = Column(String(80), nullable=False)
    resource_id = Column(String(80), nullable=True)
    summary = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# 30. ScreenTimeSettings
class ScreenTimeSetting(Base):
    __tablename__ = "screen_time_settings"

    id = Column(Integer, primary_key=True, index=True)
    child_id = Column(Integer, ForeignKey("child_profiles.id", ondelete="CASCADE"), unique=True, nullable=False)
    daily_limit_minutes = Column(Integer, default=60, nullable=False)
    used_today_minutes = Column(Integer, default=0, nullable=False)
    allowed_age_group = Column(String(30), default="6-8", nullable=False)
    restricted_categories_csv = Column(String(500), default="", nullable=False)
    bedtime_lock_enabled = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    child = relationship("ChildProfile", back_populates="screen_time")


# 31. Subscriptions
class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("parent_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_name = Column(String(80), default="Family Free Educational Plan", nullable=False)
    status = Column(String(40), default="active", nullable=False)
    max_children = Column(Integer, default=5, nullable=False)
    started_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    parent = relationship("ParentProfile", back_populates="subscriptions")


# 32. MediaAssets
class MediaAsset(Base):
    __tablename__ = "media_assets"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    storage_key = Column(String(500), unique=True, nullable=False)
    public_url = Column(String(500), nullable=False)
    media_type = Column(String(40), default="image", nullable=False)  # image, audio, thumbnail
    uploaded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# 33. PlatformSettings
class PlatformSetting(Base):
    __tablename__ = "platform_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(120), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False)
    description = Column(String(300), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


# 34. UserNotifications (Admin Messages, Alerts & Warnings to Users/Parents)
class UserNotification(Base):
    __tablename__ = "user_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    message_type = Column(String(30), default="message", nullable=False)  # message, alert, warning
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    rule_violated = Column(String(200), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# 35. PlatformRules (Community & Safety Rules enforced by Super Admin)
class PlatformRule(Base):
    __tablename__ = "platform_rules"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(60), unique=True, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(String(30), default="medium", nullable=False)  # low, medium, high, critical
    default_action = Column(String(40), default="warning", nullable=False)  # warning, suspend_24h, suspend_7d, suspend_30d, delete
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
