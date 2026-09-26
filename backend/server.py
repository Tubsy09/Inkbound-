from fastapi import FastAPI, APIRouter, Header, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta

import httpx
import bcrypt

from seed_data import STYLES, build_seed

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
async def get_parlours(style: Optional[str] = None, q: Optional[str] = None):
    query: dict = {"deleted_at": None}
    if style and style != "All":
        query["styles"] = style
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    parlours = await db.parlours.find(query, {"_id": 0}).to_list(200)
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
    taken = await db.bookings.find(
        {"artist_id": artist_id, "date": date, "status": {"$in": ["pending", "confirmed"]}}, {"_id": 0, "time": 1}
    ).to_list(100)
    taken_times = {t["time"] for t in taken}
    return {"slots": [{"time": s, "available": s not in taken_times} for s in TIME_SLOTS]}


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

    count = await db.parlours.count_documents({})
    if count == 0:
        data = build_seed()
        await db.parlours.insert_many(data["parlours"])
        await db.artists.insert_many(data["artists"])
        await db.services.insert_many(data["services"])
        await db.reviews.insert_many(data["reviews"])
        logger.info("Seeded %d parlours", len(data["parlours"]))

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
