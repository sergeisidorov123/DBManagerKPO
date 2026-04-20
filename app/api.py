from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from .db import init_db, SessionLocal
from .models import Artist, Song, Tuning, User
from .auth import register_user, authenticate_user, get_user_by_username, get_user_by_id, set_admin, delete_user, get_all_users, update_user
from sqlalchemy.orm import selectinload
from fastapi import Depends

app = FastAPI()
init_db()

app.mount("/static", StaticFiles(directory="./static"), name="static")


class UserCreate(BaseModel):
    username: str
    password: str


class TuningOut(BaseModel):
    id: int
    name: str
    notes: Optional[str]
    model_config = {"from_attributes": True}


class SongOut(BaseModel):
    id: int
    title: str
    tunings: List[TuningOut] = []
    model_config = {"from_attributes": True}


class ArtistOut(BaseModel):
    id: int
    name: str
    songs: List[SongOut] = []
    model_config = {"from_attributes": True}


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool
    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None


class PromoteIn(BaseModel):
    user_id: int


@app.get("/", include_in_schema=False)
def root():
    return FileResponse("./static/index.html")


@app.post("/api/register")
def register(u: UserCreate):
    ok, msg = register_user(u.username, u.password)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"ok": True}



@app.post("/api/login")
def login(u: UserCreate, response: Response):
    if authenticate_user(u.username, u.password):
        response.set_cookie(key="user", value=u.username, httponly=True)
        return {"ok": True}
    raise HTTPException(status_code=401, detail="Invalid credentials")


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie("user")
    return {"ok": True}


@app.get("/api/me")
def me(request: Request):
    user = request.cookies.get("user")
    if not user:
        return {"user": None}
    u = get_user_by_username(user)
    return {"user": u.username, "is_admin": bool(u.is_admin)}


@app.get("/api/artists", response_model=List[ArtistOut])
def list_artists(request: Request):
    # Return per-user artists; admin sees all
    return list_artists_for_request(request)


def _current_user(request: Request):
    uname = request.cookies.get('user')
    if not uname:
        return None
    return get_user_by_username(uname)


def list_artists_for_request(request: Request | None):
    # helper used by route; if request is None, rely on dependency in caller
    # To keep compatibility, try to read cookie from request if passed.
    db = SessionLocal()
    try:
        # If request object provided, get current user, else try no user
        user = None
        if request is not None:
            uname = request.cookies.get('user')
            if uname:
                user = db.query(User).filter_by(username=uname).first()
        # If no request or unauthenticated, return empty list
        if not user:
            return []
        if user.is_admin:
            artists = (
                db.query(Artist)
                .options(selectinload(Artist.songs).selectinload(Song.tunings))
                .order_by(Artist.name)
                .all()
            )
        else:
            artists = (
                db.query(Artist)
                .filter(Artist.owner_id == user.id)
                .options(selectinload(Artist.songs).selectinload(Song.tunings))
                .order_by(Artist.name)
                .all()
            )
        out = [ArtistOut.from_orm(a) for a in artists]
        return out
    finally:
        db.close()


class ArtistIn(BaseModel):
    name: str


@app.post("/api/artists", response_model=ArtistOut)
def create_artist(a: ArtistIn, request: Request):
    if not request.cookies.get("user"):
        raise HTTPException(status_code=403, detail="Authentication required")
    db = SessionLocal()
    try:
        user = get_user_by_username(request.cookies.get('user'))
        if not user:
            raise HTTPException(status_code=403, detail="Authentication required")
        # uniqueness per user
        if db.query(Artist).filter_by(name=a.name, owner_id=user.id).first():
            raise HTTPException(status_code=400, detail="Artist exists")
        art = Artist(name=a.name, owner_id=user.id)
        db.add(art)
        db.commit()
        db.refresh(art)
        return {"id": art.id, "name": art.name, "songs": []}
    finally:
        db.close()


@app.put("/api/artists/{artist_id}", response_model=ArtistOut)
def update_artist(artist_id: int, a: ArtistIn, request: Request):
    uname = _require_auth(request)
    db = SessionLocal()
    try:
        user = get_user_by_username(uname)
        art = db.get(Artist, artist_id)
        if not art:
            raise HTTPException(status_code=404)
        if not user.is_admin and art.owner_id != user.id:
            raise HTTPException(status_code=403)
        # uniqueness per owner
        exists = db.query(Artist).filter(Artist.owner_id == art.owner_id, Artist.name == a.name, Artist.id != artist_id).first()
        if exists:
            raise HTTPException(status_code=400, detail="Artist with this name already exists")
        art.name = a.name
        db.commit(); db.refresh(art)
        return ArtistOut.from_orm(art)
    finally:
        db.close()


@app.delete("/api/artists/{artist_id}")
def delete_artist(artist_id: int):
    # require auth via cookie
    raise HTTPException(status_code=405, detail="Use authenticated delete endpoint")


class SongIn(BaseModel):
    title: str
    artist_id: int


@app.post("/api/songs", response_model=SongOut)
def create_song(s: SongIn):
    raise HTTPException(status_code=405, detail="Use authenticated endpoint")


@app.delete("/api/songs/{song_id}")
def delete_song(song_id: int):
    raise HTTPException(status_code=405, detail="Use authenticated endpoint")


class TuningIn(BaseModel):
    name: str
    notes: Optional[str] = None
    song_id: int


@app.post("/api/tunings", response_model=TuningOut)
def create_tuning(t: TuningIn):
    raise HTTPException(status_code=405, detail="Use authenticated endpoint")


@app.delete("/api/tunings/{tuning_id}")
def delete_tuning(tuning_id: int):
    raise HTTPException(status_code=405, detail="Use authenticated endpoint")


def _require_auth(request: Request):
    user = request.cookies.get("user")
    if not user:
        raise HTTPException(status_code=403, detail="Authentication required")
    return user


@app.post("/api/artists_auth", response_model=ArtistOut)
def create_artist_auth(a: ArtistIn, request: Request):
    _require_auth(request)
    db = SessionLocal()
    try:
        user = get_user_by_username(request.cookies.get('user'))
        if not user:
            raise HTTPException(status_code=403, detail="Authentication required")
        # uniqueness per user
        if db.query(Artist).filter_by(name=a.name, owner_id=user.id).first():
            raise HTTPException(status_code=400, detail="Artist exists")
        art = Artist(name=a.name, owner_id=user.id)
        db.add(art)
        db.commit()
        db.refresh(art)
        return ArtistOut.from_orm(art)
    finally:
        db.close()


@app.post("/api/songs_auth", response_model=SongOut)
def create_song_auth(s: SongIn, request: Request):
    _require_auth(request)
    db = SessionLocal()
    try:
        # ensure artist exists and belongs to user (or admin)
        user = get_user_by_username(request.cookies.get('user'))
        art = db.get(Artist, s.artist_id)
        if not art:
            raise HTTPException(status_code=404, detail="Artist not found")
        if not user.is_admin and art.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Not allowed")
        # unique title per artist
        if db.query(Song).filter_by(title=s.title, artist_id=s.artist_id).first():
            raise HTTPException(status_code=400, detail="Song exists for this artist")
        song = Song(title=s.title, artist_id=s.artist_id)
        db.add(song); db.commit(); db.refresh(song)
        return {"id": song.id, "title": song.title, "tunings": []}
    finally:
        db.close()


@app.post("/api/tunings_auth", response_model=TuningOut)
def create_tuning_auth(t: TuningIn, request: Request):
    _require_auth(request)
    db = SessionLocal()
    try:
        user = get_user_by_username(request.cookies.get('user'))
        song = db.get(Song, t.song_id)
        if not song:
            raise HTTPException(status_code=404, detail="Song not found")
        art = db.get(Artist, song.artist_id)
        if not user.is_admin and art.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Not allowed")
        # uniqueness per song
        if db.query(Tuning).filter_by(name=t.name, song_id=t.song_id).first():
            raise HTTPException(status_code=400, detail="Tuning exists for this song")
        tn = Tuning(name=t.name, notes=t.notes, song_id=t.song_id)
        db.add(tn); db.commit(); db.refresh(tn)
        return {"id": tn.id, "name": tn.name, "notes": tn.notes}
    finally:
        db.close()


@app.delete("/api/artists/{artist_id}/auth")
def delete_artist_auth(artist_id: int, request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        art = db.get(Artist, artist_id)
        if not art:
            raise HTTPException(status_code=404)
        if not user.is_admin and art.owner_id != user.id:
            raise HTTPException(status_code=403)
        db.delete(art); db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.delete("/api/songs/{song_id}/auth")
def delete_song_auth(song_id: int, request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        s = db.get(Song, song_id)
        if not s:
            raise HTTPException(status_code=404)
        art = db.get(Artist, s.artist_id)
        if not user.is_admin and art.owner_id != user.id:
            raise HTTPException(status_code=403)
        db.delete(s); db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.delete("/api/tunings/{tuning_id}/auth")
def delete_tuning_auth(tuning_id: int, request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        t = db.get(Tuning, tuning_id)
        if not t:
            raise HTTPException(status_code=404)
        song = db.get(Song, t.song_id)
        art = db.get(Artist, song.artist_id)
        if not user.is_admin and art.owner_id != user.id:
            raise HTTPException(status_code=403)
        db.delete(t); db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.get("/api/admin/users", response_model=List[UserOut])
def admin_list_users(request: Request):
    uname = _require_auth(request)
    user = get_user_by_username(uname)
    if not user.is_admin:
        raise HTTPException(status_code=403)
    users = get_all_users()
    return [UserOut.from_orm(u) for u in users]


@app.post("/api/admin/promote")
def admin_promote(p: PromoteIn, request: Request):
    uname = _require_auth(request)
    user = get_user_by_username(uname)
    if not user.is_admin:
        raise HTTPException(status_code=403)
    ok = set_admin(p.user_id, True)
    if not ok:
        raise HTTPException(status_code=404)
    return {"ok": True}


@app.put("/api/admin/users/{user_id}")
def admin_update_user(user_id: int, uin: UserUpdate, request: Request):
    uname = _require_auth(request)
    user = get_user_by_username(uname)
    if not user.is_admin:
        raise HTTPException(status_code=403)
    if uin.username or uin.password:
        ok = update_user(user_id, username=uin.username, password=uin.password)
        if not ok:
            raise HTTPException(status_code=404)
    if uin.is_admin is not None:
        ok = set_admin(user_id, bool(uin.is_admin))
        if not ok:
            raise HTTPException(status_code=404)
    return {"ok": True}


@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: int, request: Request):
    uname = _require_auth(request)
    user = get_user_by_username(uname)
    if not user.is_admin:
        raise HTTPException(status_code=403)
    if user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    ok = delete_user(user_id)
    if not ok:
        raise HTTPException(status_code=404)
    return {"ok": True}
