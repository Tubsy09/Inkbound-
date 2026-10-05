from fastapi import FastAPI, APIRouter, Header, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import Response
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
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
from policy import appointment_start, refund_decision
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

# One currency for the whole app: artists enter prices in it and Stripe charges in it.
# The frontend (src/currency.tsx) shows the matching symbol, so change both together.
CURRENCY = os.environ.get("CURRENCY", "gbp").lower()
CURRENCY_SYMBOL = {"gbp": "£", "usd": "$", "eur": "€"}.get(CURRENCY, "")
MIN_DEPOSIT = 0.5  # smallest non-zero deposit we allow
# Clients who cancel at least this many hours before the appointment get their deposit back.
# Keep in sync with CANCEL_WINDOW_HOURS in frontend/src/policy.ts.
REFUND_WINDOW_HOURS = float(os.environ.get("REFUND_WINDOW_HOURS", "48"))
MAX_SERVICES_PER_STUDIO = 30


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


MAX_REFERENCE_IMAGES = 4


class BookingInput(BaseModel):
    artist_id: str
    service_id: str
    date: str  # ISO date YYYY-MM-DD
    time: str  # HH:MM
    note: Optional[str] = ""
    # Images the client uploaded via /api/upload (full or relative URLs are both accepted)
    reference_images: List[str] = Field(default_factory=list)


def normalize_reference_images(urls: List[str], user_id: str) -> List[str]:
    """Only accept images this user uploaded through /api/upload, so a booking can't
    point the artist's app at arbitrary external URLs. Returns relative /api/files/ URLs."""
    if len(urls) > MAX_REFERENCE_IMAGES:
        raise HTTPException(status_code=400, detail=f"You can attach up to {MAX_REFERENCE_IMAGES} images")
    prefix = f"{objstore.APP_NAME}/uploads/{user_id}/"
    out: List[str] = []
    for u in urls:
        marker = "/api/files/"
        idx = u.find(marker)
        path = u[idx + len(marker):] if idx != -1 else ""
        path = path.split("?", 1)[0]
        if not path.startswith(prefix) or ".." in path:
            raise HTTPException(status_code=400, detail="Invalid reference image")
        rel = f"{marker}{path}"
        if rel not in out:
            out.append(rel)
    return out


class BookingStatusInput(BaseModel):
    status: str  # confirmed | declined | completed | cancelled


MAX_SERVICE_PRICE = 50000


def compute_deposit(price, deposit) -> float:
    """Deposit in dollars for a service. `deposit` is the artist's fixed amount;
    None means "not set", which falls back to DEPOSIT_PERCENT of the price."""
    price = float(price or 0)
    if deposit is None:
        return round(price * DEPOSIT_PERCENT / 100, 2)
    return round(min(float(deposit), price), 2)


def booking_start(b: dict):
    """Appointment start for refund maths. If a stored date/time is malformed, fall back to far in the
    future so the client gets the benefit of the doubt rather than the request failing."""
    try:
        return appointment_start(b["date"], b["time"])
    except (KeyError, ValueError, TypeError):
        logger.warning("Booking %s has an unreadable date/time; treating refund as in time", b.get("id"))
        return now_utc() + timedelta(days=3650)


def validate_deposit(price: float, deposit) -> None:
    """Raise a 400 if an artist-entered deposit isn't allowed for this price."""
    if deposit is None:
        return
    if deposit > price:
        raise HTTPException(status_code=400, detail="The deposit can't be more than the price")
    if 0 < deposit < MIN_DEPOSIT:
        raise HTTPException(
            status_code=400,
            detail=f"The deposit must be {CURRENCY_SYMBOL}0 (none) or at least {CURRENCY_SYMBOL}{MIN_DEPOSIT:.2f}",
        )


def with_deposit(services: list) -> list:
    for sv in services:
        sv["deposit_amount"] = compute_deposit(sv.get("price", 0), sv.get("deposit"))
    return services


# Booking status rules: {current status: statuses the role may move it to}.
# declined / completed / cancelled are final.
ALL_BOOKING_STATUSES = {"pending", "confirmed", "declined", "completed", "cancelled"}
FINAL_BOOKING_STATUSES = {"declined", "completed", "cancelled"}
ARTIST_TRANSITIONS = {
    "pending": {"confirmed", "declined", "cancelled"},
    "confirmed": {"completed", "cancelled"},
}
CLIENT_TRANSITIONS = {
    "pending": {"cancelled"},
    "confirmed": {"cancelled"},
}


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
    services = with_deposit(await db.services.find({"parlour_id": parlour_id, "deleted_at": None}, {"_id": 0}).to_list(50))
    reviews = await db.reviews.find({"parlour_id": parlour_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"parlour": parlour, "artists": artists, "services": services, "reviews": reviews}


@api_router.get("/artists/{artist_id}")
async def get_artist(artist_id: str):
    artist = await db.artists.find_one({"id": artist_id}, {"_id": 0})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    if not artist.get("parlour_id"):
        raise HTTPException(status_code=404, detail="Artist not found")  # still waiting to join a studio
    parlour = await db.parlours.find_one({"id": artist["parlour_id"]}, {"_id": 0})
    services = with_deposit(await db.services.find({"parlour_id": artist["parlour_id"], "deleted_at": None}, {"_id": 0}).to_list(50))
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
    if not artist or not artist.get("parlour_id"):
        raise HTTPException(status_code=404, detail="Artist not found")
    service = await db.services.find_one({"id": body.service_id, "deleted_at": None}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    if service.get("parlour_id") != artist["parlour_id"]:
        raise HTTPException(status_code=400, detail="That service isn't offered at this artist's studio")
    parlour = await db.parlours.find_one({"id": artist["parlour_id"]}, {"_id": 0})
    price = service.get("price", 0)
    deposit_amount = compute_deposit(price, service.get("deposit"))
    reference_images = normalize_reference_images(body.reference_images, user["user_id"])
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
        "price": price,
        "date": body.date,
        "time": body.time,
        "note": body.note or "",
        "reference_images": reference_images,
        "status": "pending",
        "deposit_percent": round(deposit_amount / price * 100, 1) if price else 0,
        "deposit_amount": deposit_amount,
        "deposit_paid": False,
        "created_at": now_utc().isoformat(),
    }
    await db.bookings.insert_one(booking)
    booking.pop("_id", None)
    return {"booking": booking}


@api_router.get("/bookings/me")
async def my_bookings(user: dict = Depends(get_current_user)):
    bookings = await db.bookings.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    now = now_utc()
    for b in bookings:
        if b.get("deposit_paid") and b.get("status") in ("pending", "confirmed"):
            b["cancel_refund"], _ = refund_decision(
                cancelled_by="client",
                deposit_amount=b.get("deposit_amount", 0),
                starts_at=booking_start(b),
                now=now,
                window_hours=REFUND_WINDOW_HOURS,
            )
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
    if body.status not in ALL_BOOKING_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    # Work out which transitions this user may make from the booking's current status.
    # Clients can only cancel; only the booking's artist can confirm, decline or complete.
    current = booking.get("status", "pending")
    allowed = set()
    if is_artist:
        allowed |= ARTIST_TRANSITIONS.get(current, set())
    if is_owner:
        allowed |= CLIENT_TRANSITIONS.get(current, set())
    if body.status not in allowed:
        if current in FINAL_BOOKING_STATUSES:
            raise HTTPException(status_code=409, detail=f"This booking is already {current}")
        raise HTTPException(status_code=403, detail="You can't make that change to this booking")

    changes = {"status": body.status}
    if body.status in ("cancelled", "declined"):
        cancelled_by = "artist" if is_artist else "client"
        changes["cancelled_by"] = cancelled_by
        if booking.get("deposit_paid") and not booking.get("refund_status"):
            amount, reason = refund_decision(
                cancelled_by=cancelled_by,
                deposit_amount=booking.get("deposit_amount", 0),
                starts_at=booking_start(booking),
                now=now_utc(),
                window_hours=REFUND_WINDOW_HOURS,
            )
            # "due" = the client is owed this money back and it still has to be sent (see PRD.md);
            # "none" = nothing is owed (deposit kept under the cancellation policy).
            changes.update({"refund_amount": amount, "refund_status": "due" if amount > 0 else "none", "refund_reason": reason})
            if amount > 0:
                logger.warning("REFUND DUE booking=%s amount=%s %s (%s)", booking_id, amount, CURRENCY.upper(), reason)
    await db.bookings.update_one({"id": booking_id}, {"$set": changes})
    booking.update(changes)
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

    # An artist who works at someone else's studio can edit their own profile here, but not the studio.
    studio_row = await db.parlours.find_one({"id": parlour_id}, {"_id": 0, "owner_user_id": 1})
    owns_studio = studio_row is None or studio_row.get("owner_user_id") == user["user_id"]
    if not owns_studio:
        profile = {k: v for k, v in {"avatar": body.avatar, "specialty": body.specialty, "bio": body.bio}.items() if v}
        if profile:
            await db.artists.update_one({"id": artist_id}, {"$set": profile})
        return {"parlour_id": parlour_id, "artist_id": artist_id}

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
    await db.join_requests.update_many(
        {"user_id": user["user_id"], "status": "pending"}, {"$set": {"status": "cancelled", "decided_at": now}}
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
    parlour_id = await my_parlour_id(user, owner_only=True)
    # sanitize
    cfg = {}
    for d in WEEKDAYS:
        v = body.hours_config.get(d, {})
        cfg[d] = {
            "open": bool(v.get("open", False)),
            "start": str(v.get("start", "11:00")),
            "end": str(v.get("end", "20:00")),
        }
    await db.parlours.update_one({"id": parlour_id}, {"$set": {"hours_config": cfg}})
    return {"hours_config": cfg}


async def my_parlour_id(user: dict, owner_only: bool = False) -> str:
    """The studio the signed-in artist works at. With owner_only=True, only the studio's owner passes:
    studio-wide settings (services, prices, hours) belong to whoever runs the studio."""
    if user.get("role") != "artist" or not user.get("artist_id"):
        raise HTTPException(status_code=400, detail="Set up your studio first")
    artist = await db.artists.find_one({"id": user["artist_id"]}, {"_id": 0})
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    parlour_id = artist.get("parlour_id")
    if not parlour_id:
        raise HTTPException(status_code=400, detail="Choose a studio first (your join request is still waiting for approval)")
    if owner_only:
        parlour = await db.parlours.find_one({"id": parlour_id, "deleted_at": None}, {"_id": 0, "owner_user_id": 1})
        if not parlour or parlour.get("owner_user_id") != user["user_id"]:
            raise HTTPException(status_code=403, detail="Only the studio owner can change the studio's services and hours")
    return parlour_id


class ServiceUpdateInput(BaseModel):
    name: Optional[str] = Field(default=None, max_length=80)
    style: Optional[str] = Field(default=None, max_length=40)
    duration_min: Optional[int] = Field(default=None, ge=15, le=1440)
    price: float = Field(ge=0, le=MAX_SERVICE_PRICE)
    # Fixed deposit in dollars. null = use the studio default (DEPOSIT_PERCENT % of the price).
    deposit: Optional[float] = Field(default=None, ge=0, le=MAX_SERVICE_PRICE)


class ServiceCreateInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    style: str = Field(default="All", max_length=40)
    duration_min: int = Field(default=60, ge=15, le=1440)
    price: float = Field(default=0, ge=0, le=MAX_SERVICE_PRICE)
    deposit: Optional[float] = Field(default=None, ge=0, le=MAX_SERVICE_PRICE)


@api_router.get("/studio/services")
async def my_services(user: dict = Depends(get_current_user)):
    parlour_id = await my_parlour_id(user, owner_only=True)
    services = await db.services.find({"parlour_id": parlour_id, "deleted_at": None}, {"_id": 0}).to_list(50)
    return {"services": with_deposit(services), "default_deposit_percent": DEPOSIT_PERCENT}


@api_router.post("/studio/services")
async def create_service(body: ServiceCreateInput, user: dict = Depends(get_current_user)):
    parlour_id = await my_parlour_id(user, owner_only=True)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Give the service a name")
    price = round(body.price, 2)
    deposit = None if body.deposit is None else round(body.deposit, 2)
    validate_deposit(price, deposit)
    if await db.services.count_documents({"parlour_id": parlour_id, "deleted_at": None}) >= MAX_SERVICES_PER_STUDIO:
        raise HTTPException(status_code=400, detail=f"You can have up to {MAX_SERVICES_PER_STUDIO} services")
    service = {
        "id": make_id("sv"),
        "parlour_id": parlour_id,
        "name": name,
        "style": body.style or "All",
        "price": price,
        "duration_min": body.duration_min,
        "deposit": deposit,
        "deleted_at": None,
    }
    await db.services.insert_one(dict(service))
    service.pop("_id", None)
    return {"service": with_deposit([service])[0]}


@api_router.put("/studio/services/{service_id}")
async def update_service(service_id: str, body: ServiceUpdateInput, user: dict = Depends(get_current_user)):
    parlour_id = await my_parlour_id(user, owner_only=True)
    # Only services on the artist's own studio menu can be changed.
    service = await db.services.find_one({"id": service_id, "parlour_id": parlour_id, "deleted_at": None}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    price = round(body.price, 2)
    deposit = None if body.deposit is None else round(body.deposit, 2)
    validate_deposit(price, deposit)
    update = {"price": price, "deposit": deposit}
    if body.name is not None and body.name.strip():
        update["name"] = body.name.strip()
    if body.style is not None and body.style.strip():
        update["style"] = body.style.strip()
    if body.duration_min is not None:
        update["duration_min"] = body.duration_min
    await db.services.update_one({"id": service_id}, {"$set": update})
    service.update(update)
    return {"service": with_deposit([service])[0]}


@api_router.delete("/studio/services/{service_id}")
async def delete_service(service_id: str, user: dict = Depends(get_current_user)):
    parlour_id = await my_parlour_id(user, owner_only=True)
    service = await db.services.find_one({"id": service_id, "parlour_id": parlour_id, "deleted_at": None}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    remaining = await db.services.count_documents({"parlour_id": parlour_id, "deleted_at": None})
    if remaining <= 1:
        raise HTTPException(status_code=400, detail="Keep at least one service on your menu")
    await db.services.update_one({"id": service_id}, {"$set": {"deleted_at": now_utc().isoformat()}})
    return {"ok": True}


@api_router.get("/studio/me")
async def studio_me(user: dict = Depends(get_current_user)):
    if not user.get("artist_id"):
        return {"artist": None, "parlour": None, "is_owner": False, "pending_request": None, "pending_requests_count": 0}
    artist = await db.artists.find_one({"id": user["artist_id"]}, {"_id": 0})
    parlour = None
    if artist and artist.get("parlour_id"):
        parlour = await db.parlours.find_one({"id": artist["parlour_id"], "deleted_at": None}, {"_id": 0})
    is_owner = bool(parlour and parlour.get("owner_user_id") == user["user_id"])
    pending = await db.join_requests.find_one({"user_id": user["user_id"], "status": "pending"}, {"_id": 0})
    pending_count = 0
    if is_owner:
        pending_count = await db.join_requests.count_documents({"parlour_id": parlour["id"], "status": "pending"})
    return {
        "artist": artist,
        "parlour": parlour,
        "is_owner": is_owner,
        "pending_request": pending,
        "pending_requests_count": pending_count,
    }


# ---------------------------------------------------------------------------
# Choosing which studio you work at
#
# An artist asks to join a studio; the studio's owner approves or declines. Nobody can attach
# themselves to someone else's studio (and its name, services and reviews) without that approval.
# ---------------------------------------------------------------------------
class JoinRequestInput(BaseModel):
    parlour_id: str


class JoinRespondInput(BaseModel):
    approve: bool


async def check_can_leave_studio(artist: dict, user_id: str) -> None:
    """Raise a 400 if this artist can't move off their current studio right now."""
    today = date_cls.today().isoformat()
    open_bookings = await db.bookings.count_documents(
        {"artist_id": artist["id"], "status": {"$in": ["pending", "confirmed"]}, "date": {"$gte": today}}
    )
    if open_bookings:
        raise HTTPException(
            status_code=400,
            detail=f"Finish or cancel your {open_bookings} upcoming booking{'s' if open_bookings != 1 else ''} first - clients booked you at your current studio",
        )
    current = artist.get("parlour_id")
    if current:
        parlour = await db.parlours.find_one({"id": current, "deleted_at": None}, {"_id": 0, "owner_user_id": 1})
        if parlour and parlour.get("owner_user_id") == user_id:
            others = await db.artists.count_documents({"parlour_id": current, "id": {"$ne": artist["id"]}})
            if others:
                raise HTTPException(
                    status_code=400,
                    detail="You run a studio that other artists work at. Remove them from your team before moving to another studio",
                )


@api_router.get("/studios/search")
async def search_studios(q: Optional[str] = None, user: dict = Depends(get_current_user)):
    query: dict = {"deleted_at": None}
    if q and q.strip():
        query["name"] = {"$regex": re.escape(q.strip()), "$options": "i"}
    mine = None
    if user.get("artist_id"):
        mine = (await db.artists.find_one({"id": user["artist_id"]}, {"_id": 0, "parlour_id": 1}) or {}).get("parlour_id")
    if mine:
        query["id"] = {"$ne": mine}
    parlours = await db.parlours.find(
        query, {"_id": 0, "id": 1, "name": 1, "address": 1, "cover": 1, "styles": 1, "rating": 1, "owner_user_id": 1}
    ).limit(30).to_list(30)
    for p in parlours:
        p["artist_count"] = await db.artists.count_documents({"parlour_id": p["id"]})
        p["accepts_requests"] = bool(p.pop("owner_user_id", None))
    return {"studios": parlours}


@api_router.post("/studio/join-requests")
async def create_join_request(body: JoinRequestInput, user: dict = Depends(get_current_user)):
    parlour = await db.parlours.find_one({"id": body.parlour_id, "deleted_at": None}, {"_id": 0})
    if not parlour:
        raise HTTPException(status_code=404, detail="Studio not found")
    if not parlour.get("owner_user_id"):
        raise HTTPException(status_code=400, detail="This studio has no owner account yet, so it can't take join requests")
    if parlour["owner_user_id"] == user["user_id"]:
        raise HTTPException(status_code=400, detail="That's already your studio")

    artist = await db.artists.find_one({"id": user["artist_id"]}, {"_id": 0}) if user.get("artist_id") else None
    if artist and artist.get("parlour_id") == body.parlour_id:
        raise HTTPException(status_code=400, detail="You already work at this studio")
    if artist:
        await check_can_leave_studio(artist, user["user_id"])
    if await db.join_requests.find_one({"user_id": user["user_id"], "status": "pending"}):
        raise HTTPException(status_code=409, detail="You already have a request waiting. Cancel it first to ask a different studio")

    now = now_utc().isoformat()
    if not artist:
        # First-time artist: create a basic profile that isn't listed anywhere until a studio approves them.
        styles = [x for x in parlour.get("styles", []) if x and x != "All"] or ["Fine Line"]
        artist = {
            "id": make_id("ar"),
            "parlour_id": None,
            "owner_user_id": user["user_id"],
            "name": user.get("name", "Artist"),
            "avatar": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?crop=entropy&cs=srgb&fm=jpg&q=85&w=400",
            "specialty": f"{styles[0]} Artist",
            "bio": "Welcome to my page.",
            "styles": styles,
            "rating": 5.0,
            "years": 1,
            "portfolio": [],
        }
        await db.artists.insert_one(dict(artist))
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"role": "artist", "artist_id": artist["id"]}})

    req = {
        "id": make_id("jr"),
        "user_id": user["user_id"],
        "artist_id": artist["id"],
        "artist_name": artist.get("name", ""),
        "artist_avatar": artist.get("avatar"),
        "artist_specialty": artist.get("specialty", ""),
        "parlour_id": body.parlour_id,
        "parlour_name": parlour["name"],
        "status": "pending",
        "created_at": now,
    }
    await db.join_requests.insert_one(dict(req))
    return {"request": req, "artist_id": artist["id"]}


@api_router.delete("/studio/join-requests/me")
async def cancel_my_join_request(user: dict = Depends(get_current_user)):
    res = await db.join_requests.update_many(
        {"user_id": user["user_id"], "status": "pending"},
        {"$set": {"status": "cancelled", "decided_at": now_utc().isoformat()}},
    )
    return {"cancelled": res.modified_count}


async def owned_parlour(user: dict) -> dict:
    """The studio this user owns, or a 403."""
    parlour = await db.parlours.find_one({"owner_user_id": user["user_id"], "deleted_at": None}, {"_id": 0})
    if not parlour:
        raise HTTPException(status_code=403, detail="Only a studio owner can do that")
    return parlour


@api_router.get("/studio/join-requests")
async def list_join_requests(user: dict = Depends(get_current_user)):
    parlour = await owned_parlour(user)
    pending = await db.join_requests.find(
        {"parlour_id": parlour["id"], "status": "pending"}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    team = await db.artists.find({"parlour_id": parlour["id"]}, {"_id": 0, "id": 1, "name": 1, "avatar": 1, "specialty": 1, "owner_user_id": 1}).to_list(100)
    for a in team:
        a["is_owner"] = a.get("owner_user_id") == user["user_id"]
        a.pop("owner_user_id", None)
    return {"requests": pending, "team": team}


@api_router.post("/studio/join-requests/{request_id}/respond")
async def respond_join_request(request_id: str, body: JoinRespondInput, user: dict = Depends(get_current_user)):
    parlour = await owned_parlour(user)
    req = await db.join_requests.find_one({"id": request_id, "parlour_id": parlour["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"That request was already {req['status']}")
    now = now_utc().isoformat()

    if not body.approve:
        await db.join_requests.update_one({"id": request_id}, {"$set": {"status": "declined", "decided_at": now}})
        return {"status": "declined"}

    artist = await db.artists.find_one({"id": req["artist_id"]}, {"_id": 0})
    if not artist:
        await db.join_requests.update_one({"id": request_id}, {"$set": {"status": "cancelled", "decided_at": now}})
        raise HTTPException(status_code=404, detail="That artist no longer exists")
    # Re-check: things may have changed since they asked (e.g. new bookings).
    await check_can_leave_studio(artist, req["user_id"])

    old_parlour_id = artist.get("parlour_id")
    await db.artists.update_one({"id": artist["id"]}, {"$set": {"parlour_id": parlour["id"]}})
    styles = [x for x in artist.get("styles", []) if x and x != "All"]
    if styles:
        await db.parlours.update_one({"id": parlour["id"]}, {"$addToSet": {"styles": {"$each": styles}}})

    # If they were the only artist at a studio they ran themselves, that now-empty studio is retired.
    if old_parlour_id and old_parlour_id != parlour["id"]:
        old = await db.parlours.find_one({"id": old_parlour_id}, {"_id": 0, "owner_user_id": 1})
        if old and old.get("owner_user_id") == req["user_id"]:
            if not await db.artists.count_documents({"parlour_id": old_parlour_id}):
                await db.parlours.update_one({"id": old_parlour_id}, {"$set": {"deleted_at": now}})

    await db.join_requests.update_one({"id": request_id}, {"$set": {"status": "approved", "decided_at": now}})
    return {"status": "approved"}


@api_router.post("/studio/team/{artist_id}/remove")
async def remove_team_member(artist_id: str, user: dict = Depends(get_current_user)):
    parlour = await owned_parlour(user)
    artist = await db.artists.find_one({"id": artist_id, "parlour_id": parlour["id"]}, {"_id": 0})
    if not artist:
        raise HTTPException(status_code=404, detail="That artist isn't on your team")
    if artist.get("owner_user_id") == user["user_id"]:
        raise HTTPException(status_code=400, detail="You can't remove yourself from your own studio")
    await check_can_leave_studio(artist, artist.get("owner_user_id", ""))
    await db.artists.update_one({"id": artist_id}, {"$set": {"parlour_id": None}})
    return {"removed": artist_id}


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
    if booking.get("status") != "confirmed":
        raise HTTPException(
            status_code=409,
            detail="Your artist needs to confirm this booking before you can pay the deposit",
        )
    # Server-authoritative amount: the deposit stored on the booking when it was made, so a later
    # price change by the artist can't change what the client was shown. Older bookings fall back.
    amount = booking.get("deposit_amount")
    if amount is None:
        service = await db.services.find_one({"id": booking["service_id"]}, {"_id": 0})
        price = float(service.get("price", 0)) if service else float(booking.get("price", 0))
        amount = compute_deposit(price, service.get("deposit") if service else None)
    amount = round(float(amount), 2)
    if amount < MIN_DEPOSIT:
        raise HTTPException(status_code=400, detail="This service has no deposit")

    origin = body.origin_url.rstrip("/")
    success_url = f"{origin}/payment-result?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/payment-result?cancelled=1"

    checkout = StripeCheckout(api_key=STRIPE_API_KEY)
    req = CheckoutSessionRequest(
        amount=amount,
        currency=CURRENCY,
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
            "currency": CURRENCY,
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
        paid_now = await db.bookings.find_one_and_update(
            {"id": tx["booking_id"], "deposit_paid": {"$ne": True}},
            {"$set": {"deposit_paid": True, "deposit_paid_at": now_utc().isoformat()}},
        )
        # Paid, but the booking was cancelled/declined while the client was on the payment page:
        # they're owed the whole deposit back.
        if paid_now and paid_now.get("status") in ("cancelled", "declined"):
            owed = round(float(tx.get("amount", 0)), 2)
            await db.bookings.update_one(
                {"id": tx["booking_id"]},
                {"$set": {"refund_amount": owed, "refund_status": "due", "refund_reason": "paid_after_cancellation"}},
            )
            logger.warning("REFUND DUE booking=%s amount=%s %s (paid after cancellation)", tx["booking_id"], owed, CURRENCY.upper())
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

    # Studios created before ownership existed (e.g. the seeded demo studios) get an owner: the
    # earliest-created user whose artist profile works there. Studios nobody works at stay unowned.
    await db.join_requests.create_index([("parlour_id", 1), ("status", 1)])
    await db.join_requests.create_index([("user_id", 1), ("status", 1)])
    async for pl in db.parlours.find({"owner_user_id": {"$in": [None, ""]}}, {"_id": 0, "id": 1}):
        ids = [a["id"] async for a in db.artists.find({"parlour_id": pl["id"]}, {"_id": 0, "id": 1})]
        if not ids:
            continue
        owner = await db.users.find_one({"artist_id": {"$in": ids}}, {"_id": 0, "user_id": 1}, sort=[("created_at", 1)])
        if owner:
            await db.parlours.update_one({"id": pl["id"]}, {"$set": {"owner_user_id": owner["user_id"]}})

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
