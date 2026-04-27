from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from .db import init_db, SessionLocal
from .models import Artist, Song, Tuning, User, ActionLog
from fastapi import Query
from .auth import register_user, authenticate_user, get_user_by_username, get_user_by_id, set_admin, delete_user, get_all_users, update_user, make_token, verify_token
from .audit import log_action
from sqlalchemy.orm import selectinload
from fastapi import Depends
import json
import xml.etree.ElementTree as ET
from datetime import datetime

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
        token = make_token(u.username)
        response.set_cookie(key="user", value=token, httponly=True, samesite="lax")
        return {"ok": True}
    raise HTTPException(status_code=401, detail="Invalid credentials")


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie("user")
    return {"ok": True}


@app.get("/api/me")
def me(request: Request):
    token = request.cookies.get("user")
    if not token:
        return {"user": None}
    uname = verify_token(token)
    if not uname:
        return {"user": None}
    u = get_user_by_username(uname)
    if not u:
        return {"user": None}
    return {"user": u.username, "is_admin": bool(u.is_admin)}


@app.get("/api/artists")
def list_artists(request: Request):
    full = bool(request.query_params.get('full'))
    if full:
        return list_artists_for_request(request)
    db = SessionLocal()
    try:
        token = request.cookies.get('user')
        user = None
        if token:
            uname = verify_token(token)
            if uname:
                user = db.query(User).filter_by(username=uname).first()
        if not user:
            return JSONResponse([])
        rows = db.query(Artist).filter(Artist.owner_id == user.id).all()
        out = []
        for a in rows:
            has_songs = db.query(Song).filter(Song.artist_id == a.id).first() is not None
            out.append({"id": a.id, "name": a.name, "has_songs": has_songs})
        return JSONResponse(out)
    finally:
        db.close()


def _current_user(request: Request):
    uname = request.cookies.get('user')
    if not uname:
        return None
    return get_user_by_username(uname)


def list_artists_for_request(request: Request | None):
    db = SessionLocal()
    try:
        user = None
        if request is not None:
            token = request.cookies.get('user')
            if token:
                uname = verify_token(token)
                if uname:
                    user = db.query(User).filter_by(username=uname).first()
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


@app.post("/api/artists")
def create_artist(a: ArtistIn, request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        if db.query(Artist).filter_by(name=a.name, owner_id=user.id).first():
            raise HTTPException(status_code=400, detail="Artist exists")
        art = Artist(name=a.name, owner_id=user.id)
        db.add(art)
        db.commit()
        art_id = art.id
        db.expunge(art)
        log_action(user.id, 'create_artist', 'artist', art_id)
        return {"id": art_id, "name": a.name, "songs": []}
    finally:
        db.close()


@app.put("/api/artists/{artist_id}", response_model=ArtistOut)
def update_artist(artist_id: int, a: ArtistIn, request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        art = db.get(Artist, artist_id)
        if not art:
            raise HTTPException(status_code=404)
        if not user.is_admin and art.owner_id != user.id:
            raise HTTPException(status_code=403)
        exists = db.query(Artist).filter(Artist.owner_id == art.owner_id, Artist.name == a.name, Artist.id != artist_id).first()
        if exists:
            raise HTTPException(status_code=400, detail="Artist with this name already exists")
        art.name = a.name
        db.commit(); db.refresh(art)
        log_action(user.id, 'update_artist', 'artist', artist_id)
        return ArtistOut.from_orm(art)
    finally:
        db.close()


@app.delete("/api/artists/{artist_id}")
def delete_artist(artist_id: int):
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


class SongUpdate(BaseModel):
    title: str


class TuningUpdate(BaseModel):
    name: Optional[str] = None
    notes: Optional[str] = None
    song_id: Optional[int] = None


@app.post("/api/tunings", response_model=TuningOut)
def create_tuning(t: TuningIn):
    raise HTTPException(status_code=405, detail="Use authenticated endpoint")


@app.delete("/api/tunings/{tuning_id}")
def delete_tuning(tuning_id: int):
    raise HTTPException(status_code=405, detail="Use authenticated endpoint")


def _require_auth(request: Request):
    token = request.cookies.get("user")
    if not token:
        raise HTTPException(status_code=403, detail="Authentication required")
    uname = verify_token(token)
    if not uname:
        raise HTTPException(status_code=403, detail="Authentication required")
    u = get_user_by_username(uname)
    if not u:
        raise HTTPException(status_code=403, detail="Authentication required")
    return u


@app.post("/api/artists_auth", response_model=ArtistOut)
def create_artist_auth(a: ArtistIn, request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        if db.query(Artist).filter_by(name=a.name, owner_id=user.id).first():
            raise HTTPException(status_code=400, detail="Artist exists")
        art = Artist(name=a.name, owner_id=user.id)
        db.add(art)
        db.commit()
        art_id = art.id
        db.expunge(art)  
        log_action(user.id, 'create_artist', 'artist', art_id)
        return {"id": art_id, "name": a.name, "songs": []}
    finally:
        db.close()


@app.post("/api/songs_auth", response_model=SongOut)
def create_song_auth(s: SongIn, request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        art = db.get(Artist, s.artist_id)
        if not art:
            raise HTTPException(status_code=404, detail="Artist not found")
        if not user.is_admin and art.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Not allowed")
        if db.query(Song).filter_by(title=s.title, artist_id=s.artist_id).first():
            raise HTTPException(status_code=400, detail="Song exists for this artist")
        song = Song(title=s.title, artist_id=s.artist_id)
        db.add(song); db.commit()
        song_id = song.id
        db.expunge(song)
        log_action(user.id, 'create_song', 'song', song_id)
        return {"id": song_id, "title": s.title, "artist_id": s.artist_id, "tunings": []}
    finally:
        db.close()


@app.post("/api/tunings_auth", response_model=TuningOut)
def create_tuning_auth(t: TuningIn, request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        song = db.get(Song, t.song_id)
        if not song:
            raise HTTPException(status_code=404, detail="Song not found")
        art = db.get(Artist, song.artist_id)
        if not user.is_admin and art.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Not allowed")
        if db.query(Tuning).filter_by(name=t.name, song_id=t.song_id).first():
            raise HTTPException(status_code=400, detail="Tuning exists for this song")
        tn = Tuning(name=t.name, notes=t.notes, song_id=t.song_id)
        db.add(tn); db.commit()
        tuning_id = tn.id
        db.expunge(tn)
        log_action(user.id, 'create_tuning', 'tuning', tuning_id)
        return {"id": tuning_id, "name": t.name, "notes": t.notes, "song_id": t.song_id}
    finally:
        db.close()


@app.get("/api/artists/{artist_id}/songs")
def get_artist_songs(artist_id: int, request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        art = db.get(Artist, artist_id)
        if not art:
            raise HTTPException(status_code=404)
        if not user.is_admin and art.owner_id != user.id:
            raise HTTPException(status_code=403)
        songs = db.query(Song).filter(Song.artist_id == artist_id).all()
        out = []
        for s in songs:
            has_tunings = db.query(Tuning).filter(Tuning.song_id == s.id).first() is not None
            out.append({"id": s.id, "title": s.title, "has_tunings": has_tunings})
        return out
    finally:
        db.close()


@app.get("/api/songs/{song_id}/tunings")
def get_song_tunings(song_id: int, request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        s = db.get(Song, song_id)
        if not s:
            raise HTTPException(status_code=404)
        art = db.get(Artist, s.artist_id)
        if not user.is_admin and art.owner_id != user.id:
            raise HTTPException(status_code=403)
        tunings = db.query(Tuning).filter(Tuning.song_id == song_id).all()
        return [{"id": t.id, "name": t.name, "notes": t.notes} for t in tunings]
    finally:
        db.close()


class ReparentIn(BaseModel):
    artist_id: int


@app.put("/api/songs/{song_id}/reparent")
def reparent_song(song_id: int, data: ReparentIn, request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        s = db.get(Song, song_id)
        if not s:
            raise HTTPException(status_code=404)
        old_owner = db.query(Artist.owner_id).filter(Artist.id == s.artist_id).scalar()
        new_owner = db.query(Artist.owner_id).filter(Artist.id == data.artist_id).scalar()
        if new_owner is None:
            raise HTTPException(status_code=404, detail="Target artist not found")
        if not user.is_admin:
            if old_owner != user.id or new_owner != user.id:
                raise HTTPException(status_code=403)
        if db.query(Song).filter(Song.artist_id == data.artist_id, Song.title == s.title).first():
            raise HTTPException(status_code=400, detail="Song title already exists")
        s.artist_id = data.artist_id
        db.commit(); db.refresh(s)
        log_action(user.id, 'reparent_song', 'song', song_id)
        return {"ok": True, "song_id": song_id, "new_artist_id": data.artist_id}
    finally:
        db.close()


@app.put("/api/songs/{song_id}/auth", response_model=SongOut)
def update_song_auth(song_id: int, sin: SongUpdate, request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        s = db.get(Song, song_id)
        if not s:
            raise HTTPException(status_code=404)
        art = db.get(Artist, s.artist_id)
        if not user.is_admin and art.owner_id != user.id:
            raise HTTPException(status_code=403)
        if db.query(Song).filter(Song.artist_id == s.artist_id, Song.title == sin.title, Song.id != song_id).first():
            raise HTTPException(status_code=400, detail="Song with this title already exists")
        s.title = sin.title
        db.commit(); db.refresh(s)
        log_action(user.id, 'update_song', 'song', song_id)
        return SongOut.from_orm(s)
    finally:
        db.close()


@app.put("/api/tunings/{tuning_id}/auth")
def update_tuning_auth(tuning_id: int, tin: TuningUpdate, request: Request):
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
        if tin.name:
            if db.query(Tuning).filter(Tuning.song_id == t.song_id, Tuning.name == tin.name, Tuning.id != tuning_id).first():
                raise HTTPException(status_code=400, detail="Tuning with this name already exists")
            t.name = tin.name
        if tin.notes is not None:
            t.notes = tin.notes
        if tin.song_id is not None and tin.song_id != t.song_id:
            new_song = db.get(Song, tin.song_id)
            if not new_song:
                raise HTTPException(status_code=404, detail="Target song not found")
            new_art = db.get(Artist, new_song.artist_id)
            if not user.is_admin and new_art.owner_id != user.id:
                raise HTTPException(status_code=403)
            t.song_id = tin.song_id
        db.commit()
        result = {"id": t.id, "name": t.name, "notes": t.notes}
        log_action(user.id, 'update_tuning', 'tuning', tuning_id)
        return JSONResponse(result)
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
        log_action(user.id, 'delete_artist', 'artist', artist_id)
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
        log_action(user.id, 'delete_song', 'song', song_id)
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
        log_action(user.id, 'delete_tuning', 'tuning', tuning_id)
        return {"ok": True}
    finally:
        db.close()



@app.get("/api/admin/users", response_model=List[UserOut])
def admin_list_users(request: Request):
    user = _require_auth(request)
    if not user.is_admin:
        raise HTTPException(status_code=403)
    users = get_all_users()
    return [UserOut.from_orm(u) for u in users]


@app.post("/api/admin/promote")
def admin_promote(p: PromoteIn, request: Request):
    user = _require_auth(request)
    if not user.is_admin:
        raise HTTPException(status_code=403)
    ok = set_admin(p.user_id, True)
    if not ok:
        raise HTTPException(status_code=404)
    return {"ok": True}


@app.put("/api/admin/users/{user_id}")
def admin_update_user(user_id: int, uin: UserUpdate, request: Request):
    user = _require_auth(request)
    if not user.is_admin:
        raise HTTPException(status_code=403)
    if uin.username or uin.password:
        ok = update_user(user_id, username=uin.username, password=uin.password)
        if not ok:
            raise HTTPException(status_code=404)
    if uin.is_admin is not None:
        if user.id == user_id and not bool(uin.is_admin):
            raise HTTPException(status_code=400, detail="Cannot demote yourself")
        ok = set_admin(user_id, bool(uin.is_admin))
        if not ok:
            raise HTTPException(status_code=404)
    return {"ok": True}


@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: int, request: Request):
    user = _require_auth(request)
    if not user.is_admin:
        raise HTTPException(status_code=403)
    if user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    ok = delete_user(user_id)
    if not ok:
        raise HTTPException(status_code=404)
    return {"ok": True}


@app.get("/api/admin/audit-log")
def get_audit_log(request: Request):
    user = _require_auth(request)
    if not user.is_admin:
        raise HTTPException(status_code=403)
    db = SessionLocal()
    try:
        logs = db.query(ActionLog).order_by(ActionLog.timestamp.desc()).limit(500).all()
        return [
            {
                "id": log.id,
                "user_id": log.user_id,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "timestamp": log.timestamp if isinstance(log.timestamp, str) else (log.timestamp.isoformat() if log.timestamp else None)
            }
            for log in logs
        ]
    finally:
        db.close()


@app.get("/api/export/json")
def export_json(request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        if user.is_admin:
            artists = db.query(Artist).options(selectinload(Artist.songs).selectinload(Song.tunings)).all()
        else:
            artists = db.query(Artist).filter(Artist.owner_id == user.id).options(selectinload(Artist.songs).selectinload(Song.tunings)).all()
        
        data = {
            "user": user.username,
            "exported_at": datetime.utcnow().isoformat(),
            "artists": []
        }
        
        for art in artists:
            artist_obj = {
                "id": art.id,
                "name": art.name,
                "owner_id": art.owner_id,
                "songs": []
            }
            for song in art.songs:
                song_obj = {
                    "id": song.id,
                    "title": song.title,
                    "artist_id": song.artist_id,
                    "tunings": []
                }
                for tuning in song.tunings:
                    tuning_obj = {
                        "id": tuning.id,
                        "name": tuning.name,
                        "notes": tuning.notes,
                        "song_id": tuning.song_id
                    }
                    song_obj["tunings"].append(tuning_obj)
                artist_obj["songs"].append(song_obj)
            data["artists"].append(artist_obj)
        
        log_action(user.id, 'export_json', 'export', 0)
        
        return Response(
            content=json.dumps(data, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=artist_data_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"}
        )
    finally:
        db.close()


@app.get("/api/export/xml")
def export_xml(request: Request):
    user = _require_auth(request)
    db = SessionLocal()
    try:
        if user.is_admin:
            artists = db.query(Artist).options(selectinload(Artist.songs).selectinload(Song.tunings)).all()
        else:
            artists = db.query(Artist).filter(Artist.owner_id == user.id).options(selectinload(Artist.songs).selectinload(Song.tunings)).all()
        
        root = ET.Element("export")
        root.set("user", user.username)
        root.set("exported_at", datetime.utcnow().isoformat())
        
        for art in artists:
            artist_elem = ET.SubElement(root, "artist", id=str(art.id), owner_id=str(art.owner_id))
            artist_elem.set("name", art.name)
            
            for song in art.songs:
                song_elem = ET.SubElement(artist_elem, "song", id=str(song.id), artist_id=str(song.artist_id))
                song_elem.set("title", song.title)
                
                for tuning in song.tunings:
                    tuning_elem = ET.SubElement(song_elem, "tuning", id=str(tuning.id), song_id=str(tuning.song_id))
                    tuning_elem.set("name", tuning.name)
                    if tuning.notes:
                        tuning_elem.set("notes", tuning.notes)
        
        xml_string = ET.tostring(root, encoding='unicode')
        log_action(user.id, 'export_xml', 'export', 0)
        
        return Response(
            content=xml_string,
            media_type="application/xml",
            headers={"Content-Disposition": f"attachment; filename=artist_data_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xml"}
        )
    finally:
        db.close()
