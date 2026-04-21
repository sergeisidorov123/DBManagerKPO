from sqlalchemy import Column, Integer, String, ForeignKey, Text, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from .db import Base


class Artist(Base):
    __tablename__ = "artists"
    __table_args__ = (UniqueConstraint('name', 'owner_id', name='uq_artist_name_owner'),)
    id = Column(Integer, primary_key=True)
    name = Column(String(128), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    owner = relationship("User", back_populates="artists")
    songs = relationship("Song", back_populates="artist", cascade="all, delete-orphan")


class Song(Base):
    __tablename__ = "songs"
    __table_args__ = (UniqueConstraint('artist_id', 'title', name='uq_song_title_artist'),)
    id = Column(Integer, primary_key=True)
    title = Column(String(256), nullable=False)
    artist_id = Column(Integer, ForeignKey("artists.id", ondelete="CASCADE"))
    artist = relationship("Artist", back_populates="songs")
    tunings = relationship("Tuning", back_populates="song", cascade="all, delete-orphan")


class Tuning(Base):
    __tablename__ = "tunings"
    __table_args__ = (UniqueConstraint('song_id', 'name', name='uq_tuning_name_song'),)
    id = Column(Integer, primary_key=True)
    name = Column(String(128), nullable=False)
    notes = Column(Text)
    song_id = Column(Integer, ForeignKey("songs.id", ondelete="CASCADE"))
    song = relationship("Song", back_populates="tunings")


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(128), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    artists = relationship("Artist", back_populates="owner", cascade="all, delete-orphan")


class ActionLog(Base):
    __tablename__ = 'action_logs'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    action = Column(String(64), nullable=False)
    target_type = Column(String(64))
    target_id = Column(Integer)
    timestamp = Column(String(64))
