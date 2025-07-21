import uuid

from database import Base
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declared_attr
from sqlalchemy.orm import relationship


class TimestampsMixin:
    @declared_attr
    def created_at(cls):
        return Column(DateTime, nullable=False, server_default=func.now())

    @declared_attr
    def updated_at(cls):
        return Column(
            DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
        )

    @declared_attr
    def deleted_at(cls):
        return Column(DateTime)


class Game(Base, TimestampsMixin):
    __tablename__ = "games"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    description = Column(String)

    # relationships
    teams = relationship("Team", back_populates="game")
    levels = relationship("Level", back_populates="game")
    messages = relationship("Message", back_populates="game")

    # repr str
    def __repr__(self):
        return f"<Game(id={self.id}, name={self.name})>"

    def __str__(self):
        return f"Game {self.name} (ID: {self.id})"


class Level(Base, TimestampsMixin):
    __tablename__ = "levels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id = Column(
        UUID(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE"), nullable=False
    )
    # relationships
    game = relationship("Game", back_populates="levels")
    team_levels = relationship("TeamLevel", back_populates="level")
    messages = relationship("Message", back_populates="level")

    # repr str
    def __repr__(self):
        return f"<Level(id={self.id}, game_id={self.game_id})>"

    def __str__(self):
        return f"Level {self.id}"


class TeamLevel(Base, TimestampsMixin):
    __tablename__ = "team_levels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id = Column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    level_id = Column(
        UUID(as_uuid=True),
        ForeignKey("levels.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    index = Column(Integer, nullable=False)
    completed_at = Column(DateTime, default=None)

    # relationships
    team = relationship("Team", back_populates="team_levels")
    level = relationship("Level")

    # repr str
    def __repr__(self):
        return f"<TeamLevel(id={self.id}, team_id={self.team_id}, level_id={self.level_id}, index={self.index}, completed_at={self.completed_at})>"

    def __str__(self):
        return f"TeamLevel {self.id} (Team: {self.team_id}, Level: {self.level_id}, Index: {self.index}, Completed At: {self.completed_at})"


class Team(Base, TimestampsMixin):
    __tablename__ = "teams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    game_id = Column(
        UUID(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE"), nullable=False
    )

    # relationships
    game = relationship("Game", back_populates="teams")
    team_levels = relationship("TeamLevel", back_populates="team")
    messages = relationship("Message", back_populates="team")
    users = relationship("User", back_populates="team")

    # repr str
    def __repr__(self):
        return f"<Team(id={self.id}, name={self.name})>"

    def __str__(self):
        return f"Team {self.name} (ID: {self.id})"


class User(Base, TimestampsMixin):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id = Column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # relationships
    team = relationship("Team", back_populates="users")
    messages = relationship("Message", back_populates="user")

    # repr str
    def __repr__(self):
        return f"<User(id={self.id})>"

    def __str__(self):
        return f"User (ID: {self.id})"


class Message(Base, TimestampsMixin):
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    team_id = Column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    game_id = Column(
        UUID(as_uuid=True),
        ForeignKey("games.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    level_id = Column(
        UUID(as_uuid=True),
        ForeignKey("levels.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    role = Column(String, nullable=False)
    text = Column(String, nullable=False)

    # relationships
    user = relationship("User", back_populates="messages")
    team = relationship("Team", back_populates="messages")
    game = relationship("Game", back_populates="messages")
    level = relationship("Level", back_populates="messages")

    # repr str
    def __repr__(self):
        return f"<Message(id={self.id}, user_id={self.user_id}, team_id={self.team_id}, game_id={self.game_id}, level_id={self.level_id}, role={self.role})>"

    def __str__(self):
        return f"Message {self.id} (User: {self.user_id}, Team: {self.team_id}, Game: {self.game_id}, Level: {self.level_id}, Role: {self.role})"
