from fastapi import FastAPI, APIRouter, Header, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from motor.motor_asyncio import AsyncIOMotorClient
import os
import math
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta, date as date_cls

import httpx
import bcrypt

from seed_data import STYLES, build_seed, service_defs_for_styles
import storage as objstore
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

DEPOSIT_PERCENT = float(os.environ.get("DEPOSIT_PERCENT", "20"))
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return round(r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 1)


WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def default_hours_config():
    # Open Tue–Sun 11:00–20:00, closed Monday — sensible tattoo-studio default.
    cfg = {}
    for i, d in enumerate(WEEKDAYS):
        cfg[d] = {"open": d != "mon", "start": "11:00", "end": "20:00"}
    return cfg


def slots_for_range(start: str, end: str):
    sh = int(start.split(":")[0])
    eh = int(end.split(":")[0])
    return [f"{h:02d}:00" for h in range(sh, eh)]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def public_user(user: dict) -> dict:
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user.get("name", ""),
        "picture": user.get("picture"),
        "role": user.get("role", "customer"),
        "artist_id": user.get("artist_id"),
    }


async def create_session(user_id: str) -> str:
    token = uuid.uuid4().hex + uuid.uuid4().hex
    await db.user_sessions.insert_one(
        {
            "session_token": token,
            "user_id": user_id,
            "created_at": now_utc(),
            "expires_at": now_utc() + timedelta(days=7),
        }
    )
    return token


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    role: str = "customer"


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class SessionInput(BaseModel):
    session_id: str


class BookingInput(BaseModel):
    artist_id: str
    service_id: str
    date: str  # ISO date YYYY-MM-DD
    time: str  # HH:MM
    note: Optional[str] = ""


class BookingStatusInput(BaseModel):
    status: str  # confirmed | declined | completed | cancelled


class ReviewInput(BaseModel):
    parlour_id: str
    rating: int = Field(ge=1, le=5)
    comment: str = ""


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(body: RegisterInput):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    role = body.role if body.role in ("customer", "artist") else "customer"
    user = {
        "user_id": make_id("user"),
        "email": body.email.lower(),
        "name": body.name,
        "password_hash": hash_password(body.password),
        "role": role,
        "picture": None,
        "artist_id": None,
        "created_at": now_utc(),
    }
    await db.users.insert_one(user)
    token = await create_session(user["user_id"])
    return {"session_token": token, "user": public_user(user)}


@api_router.post("/auth/login")
async def login(body: LoginInput):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = await create_session(user["user_id"])
    return {"session_token": token, "user": public_user(user)}


@api_router.post("/auth/session")
async def google_session(body: SessionInput):
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id})
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session id")
    data = resp.json()
    email = data.get("email", "").lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        user = existing
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"picture": data.get("picture")}})
        user["picture"] = data.get("picture")
    else:
        user = {
            "user_id": make_id("user"),
            "email": email,
            "name": data.get("name", ""),
            "password_hash": None,
            "role": "customer",
            "picture": data.get("picture"),
            "artist_id": None,
            "created_at": now_utc(),
        }
        await db.users.insert_one(user)
    session_token = data.get("session_token") or (uuid.uuid4().hex + uuid.uuid4().hex)
    await db.user_sessions.insert_one(
        {
            "session_token": session_token,
            "user_id": user["user_id"],
            "created_at": now_utc(),
            "expires_at": now_utc() + timedelta(days=7),
        }
    )
    return {"session_token": session_token, "user": public_user(user)}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": public_user(user)}


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Discovery routes
# ---------------------------------------------------------------------------
@api_router.get("/styles")
async def get_styles():
    return {"styles": STYLES}


@api_router.get("/parlours")
async def get_parlours(
    style: Optional[str] = None,
    q: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    sort: Optional[str] = None,
):
    query: dict = {"deleted_at": None}
    if style and style != "All":
        query["styles"] = style
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    parlours = await db.parlours.find(query, {"_id": 0}).to_list(200)
    if lat is not None and lng is not None:
        for p in parlours:
            p["distance_km"] = haversine_km(lat, lng, p["latitude"], p["longitude"])
        if sort == "distance":
            parlours.sort(key=lambda x: x.get("distance_km", 1e9))
    return {"parlours": parlours}


@api_router.get("/parlours/{parlour_id}")
async def get_parlour(parlour_id: str):
    parlour = await db.parlours.find_one({"id": parlour_id, "deleted_at": None}, {"_id": 0})
    if not parlour:
        raise HTTPException(status_code=404, detail="Parlour not found")
    artists = await db.artists.find({"parlour_id": parlour_id}, {"_id": 0}).to_list(50)
    services = await db.services.find({"parlour_id": parlour_id}, {"_id": 0}).to_list(50)
    reviews = await db.reviews.find({"parlour_id": parlour_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"parlour": parlour, "artists": artists, "services": services, "reviews": reviews}


@api_router.get("/artists/{artist_id}")
async def get_artist(artist_id: str):
    artist = await db.artists.find_one({"id": artist_id}, {"_id": 0})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    parlour = await db.parlours.find_one({"id": artist["parlour_id"]}, {"_id": 0})
    services = await db.services.find({"parlour_id": artist["parlour_id"]}, {"_id": 0}).to_list(50)
    return {"artist": artist, "parlour": parlour, "services": services}


# ---------------------------------------------------------------------------
# Booking routes
# ---------------------------------------------------------------------------
TIME_SLOTS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"]


@api_router.get("/bookings/slots")
async def get_slots(artist_id: str, date: str):
    artist = await db.artists.find_one({"id": artist_id}, {"_id": 0})
    parlour = await db.parlours.find_one({"id": artist["parlour_id"]}, {"_id": 0}) if artist else None
    hours = (parlour or {}).get("hours_config") or default_hours_config()
    try:
        weekday = WEEKDAYS[date_cls.fromisoformat(date).weekday()]
    except Exception:
        weekday = "mon"
    day = hours.get(weekday, {"open": False})
    if not day.get("open"):
        return {"open": False, "slots": []}
    all_slots = slots_for_range(day.get("start", "11:00"), day.get("end", "20:00"))
    taken = await db.bookings.find(
        {"artist_id": artist_id, "date": date, "status": {"$in": ["pending", "confirmed"]}}, {"_id": 0, "time": 1}
    ).to_list(100)
    taken_times = {t["time"] for t in taken}
    return {"open": True, "slots": [{"time": s, "available": s not in taken_times} for s in all_slots]}


@api_router.post("/bookings")
async def create_booking(body: BookingInput, user: dict = Depends(get_current_user)):
    artist = await db.artists.find_one({"id": body.artist_id}, {"_id": 0})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    service = await db.services.find_one({"id": body.service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    parlour = await db.parlours.find_one({"id": artist["parlour_id"]}, {"_id": 0})
    clash = await db.bookings.find_one(
        {"artist_id": body.artist_id, "date": body.date, "time": body.time, "status": {"$in": ["pending", "confirmed"]}}
    )
    if clash:
        raise HTTPException(status_code=409, detail="That time slot is no longer available")
    booking = {
        "id": make_id("bk"),
        "user_id": user["user_id"],
        "customer_name": user.get("name", ""),
        "artist_id": body.artist_id,
        "artist_name": artist["name"],
        "artist_avatar": artist.get("avatar"),
        "parlour_id": artist["parlour_id"],
        "parlour_name": parlour["name"] if parlour else "",
        "service_id": body.service_id,
        "service_name": service["name"],
        "style": service.get("style", ""),
        "price": service.get("price", 0),
        "date": body.date,
        "time": body.time,
        "note": body.note or "",
        "status": "pending",
        "deposit_percent": DEPOSIT_PERCENT,
        "deposit_amount": round(service.get("price", 0) * DEPOSIT_PERCENT / 100, 2),
        "deposit_paid": False,
        "created_at": now_utc().isoformat(),
    }
    await db.bookings.insert_one(booking)
    booking.pop("_id", None)
    return {"booking": booking}


@api_router.get("/bookings/me")
async def my_bookings(user: dict = Depends(get_current_user)):
    bookings = await db.bookings.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"bookings": bookings}


@api_router.get("/bookings/artist")
async def artist_bookings(user: dict = Depends(get_current_user)):
    if user.get("role") != "artist" or not user.get("artist_id"):
        return {"bookings": []}
    bookings = (
        await db.bookings.find({"artist_id": user["artist_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    )
    return {"bookings": bookings}


@api_router.patch("/bookings/{booking_id}/status")
async def update_booking_status(booking_id: str, body: BookingStatusInput, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    is_artist = user.get("role") == "artist" and user.get("artist_id") == booking["artist_id"]
    is_owner = booking["user_id"] == user["user_id"]
    if not (is_artist or is_owner):
        raise HTTPException(status_code=403, detail="Not allowed")
    if body.status not in ("confirmed", "declined", "completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Invalid status")
    await db.bookings.update_one({"id": booking_id}, {"$set": {"status": body.status}})
    booking["status"] = body.status
    return {"booking": booking}


@api_router.post("/reviews")
async def create_review(body: ReviewInput, user: dict = Depends(get_current_user)):
    review = {
        "id": make_id("rv"),
        "parlour_id": body.parlour_id,
        "user_id": user["user_id"],
        "user_name": user.get("name", "Anonymous"),
        "rating": body.rating,
        "comment": body.comment,
        "created_at": now_utc().isoformat(),
    }
    await db.reviews.insert_one(review)
    review.pop("_id", None)
    all_reviews = await db.reviews.find({"parlour_id": body.parlour_id}, {"_id": 0, "rating": 1}).to_list(1000)
    if all_reviews:
        avg = round(sum(r["rating"] for r in all_reviews) / len(all_reviews), 1)
        await db.parlours.update_one(
            {"id": body.parlour_id}, {"$set": {"rating": avg, "review_count": len(all_reviews)}}
        )
    return {"review": review}


# ---------------------------------------------------------------------------
# Favourites
# ---------------------------------------------------------------------------
class FavInput(BaseModel):
    kind: str  # "parlour" | "artist"
    item_id: str


@api_router.post("/favourites/toggle")
async def toggle_favourite(body: FavInput, user: dict = Depends(get_current_user)):
    if body.kind not in ("parlour", "artist"):
        raise HTTPException(status_code=400, detail="Invalid kind")
    existing = await db.favourites.find_one(
        {"user_id": user["user_id"], "kind": body.kind, "item_id": body.item_id}
    )
    if existing:
        await db.favourites.delete_one({"_id": existing["_id"]})
        return {"favourited": False}
    await db.favourites.insert_one(
        {"user_id": user["user_id"], "kind": body.kind, "item_id": body.item_id, "created_at": now_utc().isoformat()}
    )
    return {"favourited": True}


@api_router.get("/favourites")
async def get_favourites(user: dict = Depends(get_current_user)):
    favs = await db.favourites.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    parlour_ids = [f["item_id"] for f in favs if f["kind"] == "parlour"]
    artist_ids = [f["item_id"] for f in favs if f["kind"] == "artist"]
    parlours = await db.parlours.find({"id": {"$in": parlour_ids}}, {"_id": 0}).to_list(200)
    artists = await db.artists.find({"id": {"$in": artist_ids}}, {"_id": 0}).to_list(200)
    return {"parlours": parlours, "artists": artists, "ids": {"parlour": parlour_ids, "artist": artist_ids}}


@api_router.get("/favourites/ids")
async def get_favourite_ids(user: dict = Depends(get_current_user)):
    favs = await db.favourites.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(500)
    return {
        "parlour": [f["item_id"] for f in favs if f["kind"] == "parlour"],
        "artist": [f["item_id"] for f in favs if f["kind"] == "artist"],
    }


# ---------------------------------------------------------------------------
# Object storage upload / download
# ---------------------------------------------------------------------------
@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = (file.filename or "img").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp", "heic"):
        ext = "jpg"
    path = f"{objstore.APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    data = await file.read()
    content_type = file.content_type or "image/jpeg"
    try:
        await run_in_threadpool(objstore.put_object, path, data, content_type)
    except Exception as e:
        logger.exception("upload failed")
        raise HTTPException(status_code=502, detail="Upload failed")
    return {"path": path, "url": f"/api/files/{path}"}


@api_router.get("/files/{path:path}")
async def get_file(path: str):
    try:
        content, content_type = await run_in_threadpool(objstore.get_object, path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=content, media_type=content_type)


# ---------------------------------------------------------------------------
# Artist / studio onboarding
# ---------------------------------------------------------------------------
class StudioSetupInput(BaseModel):
    name: str
    tagline: str = ""
    address: str
    latitude: float = 34.0522
    longitude: float = -118.2437
    styles: List[str] = []
    cover: Optional[str] = None
    specialty: str = ""
    bio: str = ""
    avatar: Optional[str] = None
    price_level: str = "$$"
    hours: str = "By appointment"


@api_router.post("/studio/setup")
async def studio_setup(body: StudioSetupInput, user: dict = Depends(get_current_user)):
    styles = [s for s in body.styles if s and s != "All"] or ["Fine Line"]
    now = now_utc().isoformat()
    default_cover = "https://images.unsplash.com/photo-1760877611905-0f885a3ce551?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"
    default_avatar = "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?crop=entropy&cs=srgb&fm=jpg&q=85&w=400"

    existing_artist_id = user.get("artist_id")
    parlour_id = existing_artist_id and (await db.artists.find_one({"id": existing_artist_id}, {"_id": 0}) or {}).get("parlour_id")
    if not parlour_id:
        parlour_id = make_id("pl")
    artist_id = existing_artist_id or make_id("ar")

    parlour_set = {
        "owner_user_id": user["user_id"],
        "name": body.name,
        "tagline": body.tagline or f"{styles[0]} specialists.",
        "address": body.address,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "cover": body.cover or default_cover,
        "styles": styles,
        "price_level": body.price_level,
        "hours": body.hours,
        "deleted_at": None,
    }
    parlour_insert = {
        "id": parlour_id,
        "gallery": [body.cover or default_cover],
        "rating": 5.0,
        "review_count": 0,
        "hours_config": default_hours_config(),
        "created_at": now,
    }
    await db.parlours.update_one(
        {"id": parlour_id}, {"$set": parlour_set, "$setOnInsert": parlour_insert}, upsert=True
    )

    artist_set = {
        "parlour_id": parlour_id,
        "owner_user_id": user["user_id"],
        "name": user.get("name", "Artist"),
        "avatar": body.avatar or default_avatar,
        "specialty": body.specialty or f"{styles[0]} Artist",
        "bio": body.bio or "Welcome to my studio.",
        "styles": styles,
    }
    artist_insert = {
        "id": artist_id,
        "rating": 5.0,
        "years": 1,
        "portfolio": [],
    }
    await db.artists.update_one(
        {"id": artist_id}, {"$set": artist_set, "$setOnInsert": artist_insert}, upsert=True
    )

    # Seed a starter service menu only on first setup; never wipe edited menus.
    existing_services = await db.services.count_documents({"parlour_id": parlour_id})
    if existing_services == 0:
        services = service_defs_for_styles(parlour_id, styles)
        if services:
            await db.services.insert_many([dict(s) for s in services])

    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"role": "artist", "artist_id": artist_id}}
    )
    return {"parlour_id": parlour_id, "artist_id": artist_id}


class PortfolioInput(BaseModel):
    url: str


@api_router.post("/studio/portfolio")
async def add_portfolio(body: PortfolioInput, user: dict = Depends(get_current_user)):
    if not user.get("artist_id"):
        raise HTTPException(status_code=400, detail="Set up your studio first")
    await db.artists.update_one({"id": user["artist_id"]}, {"$push": {"portfolio": body.url}})
    artist = await db.artists.find_one({"id": user["artist_id"]}, {"_id": 0})
    return {"portfolio": artist.get("portfolio", []) if artist else []}


@api_router.post("/studio/portfolio/remove")
async def remove_portfolio(body: PortfolioInput, user: dict = Depends(get_current_user)):
    if not user.get("artist_id"):
        raise HTTPException(status_code=400, detail="Set up your studio first")
    await db.artists.update_one({"id": user["artist_id"]}, {"$pull": {"portfolio": body.url}})
    artist = await db.artists.find_one({"id": user["artist_id"]}, {"_id": 0})
    return {"portfolio": artist.get("portfolio", []) if artist else []}


class ReorderInput(BaseModel):
    order: List[str]


@api_router.post("/studio/portfolio/reorder")
async def reorder_portfolio(body: ReorderInput, user: dict = Depends(get_current_user)):
    if not user.get("artist_id"):
        raise HTTPException(status_code=400, detail="Set up your studio first")
    artist = await db.artists.find_one({"id": user["artist_id"]}, {"_id": 0})
    current = set(artist.get("portfolio", []) if artist else [])
    # keep only known urls, then append any missing to be safe
    new_order = [u for u in body.order if u in current]
    for u in current:
        if u not in new_order:
            new_order.append(u)
    await db.artists.update_one({"id": user["artist_id"]}, {"$set": {"portfolio": new_order}})
    return {"portfolio": new_order}


class HoursInput(BaseModel):
    hours_config: dict


@api_router.post("/studio/hours")
async def set_hours(body: HoursInput, user: dict = Depends(get_current_user)):
    if not user.get("artist_id"):
        raise HTTPException(status_code=400, detail="Set up your studio first")
    artist = await db.artists.find_one({"id": user["artist_id"]}, {"_id": 0})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    # sanitize
    cfg = {}
    for d in WEEKDAYS:
        v = body.hours_config.get(d, {})
        cfg[d] = {
            "open": bool(v.get("open", False)),
            "start": str(v.get("start", "11:00")),
            "end": str(v.get("end", "20:00")),
        }
    await db.parlours.update_one({"id": artist["parlour_id"]}, {"$set": {"hours_config": cfg}})
    return {"hours_config": cfg}


@api_router.get("/studio/me")
async def studio_me(user: dict = Depends(get_current_user)):
    if not user.get("artist_id"):
        return {"artist": None, "parlour": None}
    artist = await db.artists.find_one({"id": user["artist_id"]}, {"_id": 0})
    parlour = await db.parlours.find_one({"id": artist["parlour_id"]}, {"_id": 0}) if artist else None
    return {"artist": artist, "parlour": parlour}


@api_router.get("/studio/earnings")
async def studio_earnings(user: dict = Depends(get_current_user)):
    if user.get("role") != "artist" or not user.get("artist_id"):
        raise HTTPException(status_code=400, detail="Set up your studio first")

    # Earnings count confirmed + completed appointments, by appointment date.
    earned = await db.bookings.find(
        {"artist_id": user["artist_id"], "status": {"$in": ["confirmed", "completed"]}},
        {"_id": 0},
    ).to_list(1000)
    pending = await db.bookings.find(
        {"artist_id": user["artist_id"], "status": "pending"}, {"_id": 0, "price": 1}
    ).to_list(1000)

    today = date_cls.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)

    def parse(d: str):
        try:
            return date_cls.fromisoformat(d)
        except Exception:
            return None

    today_total = week_total = total = 0.0
    today_count = week_count = 0
    # last 7 days chart buckets (oldest -> today)
    days = [today - timedelta(days=i) for i in range(6, -1, -1)]
    daily = {d.isoformat(): 0.0 for d in days}

    for b in earned:
        price = float(b.get("price", 0) or 0)
        total += price
        bd = parse(b.get("date", ""))
        if not bd:
            continue
        if bd == today:
            today_total += price
            today_count += 1
        if monday <= bd <= sunday:
            week_total += price
            week_count += 1
        if bd.isoformat() in daily:
            daily[bd.isoformat()] += price

    pending_revenue = sum(float(p.get("price", 0) or 0) for p in pending)

    chart = [
        {"date": d.isoformat(), "label": d.strftime("%a"), "amount": round(daily[d.isoformat()], 2)}
        for d in days
    ]

    return {
        "today": round(today_total, 2),
        "week": round(week_total, 2),
        "total": round(total, 2),
        "today_count": today_count,
        "week_count": week_count,
        "pending_revenue": round(pending_revenue, 2),
        "pending_count": len(pending),
        "chart": chart,
    }


# ---------------------------------------------------------------------------
# Stripe deposit checkout
# ---------------------------------------------------------------------------
class CheckoutInput(BaseModel):
    booking_id: str
    origin_url: str


@api_router.post("/checkout/create")
async def create_checkout(body: CheckoutInput, user: dict = Depends(get_current_user)):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Payments are not configured yet")
    booking = await db.bookings.find_one({"id": body.booking_id, "user_id": user["user_id"]}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("deposit_paid"):
        raise HTTPException(status_code=409, detail="Deposit already paid")
    # server-authoritative amount from stored service price
    service = await db.services.find_one({"id": booking["service_id"]}, {"_id": 0})
    price = float(service.get("price", 0)) if service else float(booking.get("price", 0))
    amount = round(price * DEPOSIT_PERCENT / 100, 2)
    if amount < 0.5:
        raise HTTPException(status_code=400, detail="This service has no deposit")

    origin = body.origin_url.rstrip("/")
    success_url = f"{origin}/payment-result?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/payment-result?cancelled=1"

    checkout = StripeCheckout(api_key=STRIPE_API_KEY)
    req = CheckoutSessionRequest(
        amount=amount,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"booking_id": body.booking_id, "user_id": user["user_id"], "kind": "deposit"},
    )
    session = await checkout.create_checkout_session(req)

    await db.payment_transactions.insert_one(
        {
            "session_id": session.session_id,
            "booking_id": body.booking_id,
            "user_id": user["user_id"],
            "amount": amount,
            "currency": "usd",
            "payment_status": "unpaid",
            "transaction_status": "created",
            "created_at": now_utc().isoformat(),
            "updated_at": now_utc().isoformat(),
        }
    )
    return {"url": session.url, "session_id": session.session_id, "amount": amount}


@api_router.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, user: dict = Depends(get_current_user)):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=503, detail="Payments are not configured yet")
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Unknown session")
    checkout = StripeCheckout(api_key=STRIPE_API_KEY)
    status = await checkout.get_checkout_status(session_id)
    payment_status = getattr(status, "payment_status", "unpaid")
    update = {"payment_status": payment_status, "updated_at": now_utc().isoformat()}
    if payment_status == "paid" and tx.get("payment_status") != "paid":
        update["transaction_status"] = "paid"
        await db.bookings.update_one(
            {"id": tx["booking_id"], "deposit_paid": {"$ne": True}},
            {"$set": {"deposit_paid": True, "status": "confirmed"}},
        )
    await db.payment_transactions.update_one({"session_id": session_id}, {"$set": update})
    return {
        "status": getattr(status, "status", None),
        "payment_status": payment_status,
        "amount_total": getattr(status, "amount_total", None),
    }


# ---------------------------------------------------------------------------
# Startup: indexes + seed
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.bookings.create_index("user_id")
    await db.bookings.create_index("artist_id")
    await db.favourites.create_index([("user_id", 1), ("kind", 1), ("item_id", 1)])
    try:
        await db.payment_transactions.create_index("session_id", unique=True)
    except Exception:
        pass
    try:
        await run_in_threadpool(objstore.init_storage)
        logger.info("Object storage initialised")
    except Exception as e:
        logger.warning("Object storage init failed: %s", e)

    count = await db.parlours.count_documents({})
    if count == 0:
        data = build_seed()
        await db.parlours.insert_many(data["parlours"])
        await db.artists.insert_many(data["artists"])
        await db.services.insert_many(data["services"])
        await db.reviews.insert_many(data["reviews"])
        logger.info("Seeded %d parlours", len(data["parlours"]))

    # Ensure every parlour has a structured hours config for booking gating.
    await db.parlours.update_many(
        {"hours_config": {"$exists": False}}, {"$set": {"hours_config": default_hours_config()}}
    )

    demo_artist = await db.users.find_one({"email": "artist@inkbound.com"})
    if not demo_artist:
        await db.users.insert_one(
            {
                "user_id": make_id("user"),
                "email": "artist@inkbound.com",
                "name": "Mara Voss",
                "password_hash": hash_password("Passw0rd!"),
                "role": "artist",
                "picture": None,
                "artist_id": "ar_1",
                "created_at": now_utc(),
            }
        )
    demo_customer = await db.users.find_one({"email": "customer@inkbound.com"})
    if not demo_customer:
        await db.users.insert_one(
            {
                "user_id": make_id("user"),
                "email": "customer@inkbound.com",
                "name": "Alex Rivera",
                "password_hash": hash_password("Passw0rd!"),
                "role": "customer",
                "picture": None,
                "artist_id": None,
                "created_at": now_utc(),
            }
        )

    # Seed a spread of completed appointments for the demo artist (ar_1) so the
    # earnings dashboard shows realistic day/week numbers out of the box.
    demo_earnings = await db.bookings.count_documents({"artist_id": "ar_1", "seed_earning": True})
    if demo_earnings == 0:
        cust = await db.users.find_one({"email": "customer@inkbound.com"}, {"_id": 0})
        ar1 = await db.artists.find_one({"id": "ar_1"}, {"_id": 0})
        svcs = await db.services.find({"parlour_id": "pl_1", "price": {"$gt": 0}}, {"_id": 0}).to_list(50)
        if cust and ar1 and svcs:
            today = date_cls.today()
            # (days_ago, service_index, status)
            plan = [
                (0, 1, "completed"), (0, 0, "confirmed"),
                (1, 3, "completed"), (2, 1, "completed"),
                (3, 0, "completed"), (4, 3, "completed"),
                (5, 1, "completed"), (6, 0, "completed"),
            ]
            docs = []
            for days_ago, si, status in plan:
                sv = svcs[si % len(svcs)]
                d = (today - timedelta(days=days_ago)).isoformat()
                docs.append({
                    "id": make_id("bk"),
                    "user_id": cust["user_id"],
                    "customer_name": cust["name"],
                    "artist_id": "ar_1",
                    "artist_name": ar1["name"],
                    "artist_avatar": ar1.get("avatar"),
                    "parlour_id": "pl_1",
                    "parlour_name": "Iron & Ink Collective",
                    "service_id": sv["id"],
                    "service_name": sv["name"],
                    "style": sv.get("style", ""),
                    "price": sv.get("price", 0),
                    "date": d,
                    "time": "14:00",
                    "note": "",
                    "status": status,
                    "deposit_percent": DEPOSIT_PERCENT,
                    "deposit_amount": round(sv.get("price", 0) * DEPOSIT_PERCENT / 100, 2),
                    "deposit_paid": True,
                    "seed_earning": True,
                    "created_at": now_utc().isoformat(),
                })
            if docs:
                await db.bookings.insert_many(docs)
                logger.info("Seeded %d demo earnings bookings", len(docs))

    logger.info("Startup complete")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
