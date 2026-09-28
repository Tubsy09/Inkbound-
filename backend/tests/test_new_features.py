"""Tests for NEW features: favourites, studio setup/portfolio/me, earnings, near-me, upload, checkout 503."""
import io
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://tattoo-spots.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CUSTOMER = {"email": "customer@inkbound.com", "password": "Passw0rd!"}
ARTIST = {"email": "artist@inkbound.com", "password": "Passw0rd!"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def customer_token(s):
    r = s.post(f"{API}/auth/login", json=CUSTOMER, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def artist_token(s):
    r = s.post(f"{API}/auth/login", json=ARTIST, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Favourites ----------
class TestFavourites:
    def test_toggle_parlour_on_off_and_ids(self, s, customer_token):
        # Ensure clean state - remove pl_2 if already favourited
        ids = s.get(f"{API}/favourites/ids", headers=auth(customer_token), timeout=20).json()
        if "pl_2" in ids.get("parlour", []):
            s.post(f"{API}/favourites/toggle", headers=auth(customer_token),
                   json={"kind": "parlour", "item_id": "pl_2"}, timeout=20)

        # Toggle ON pl_2
        r1 = s.post(f"{API}/favourites/toggle", headers=auth(customer_token),
                    json={"kind": "parlour", "item_id": "pl_2"}, timeout=20)
        assert r1.status_code == 200
        assert r1.json()["favourited"] is True

        r_ids = s.get(f"{API}/favourites/ids", headers=auth(customer_token), timeout=20)
        assert "pl_2" in r_ids.json()["parlour"]

        # Full list contains parlour with id pl_2
        r_full = s.get(f"{API}/favourites", headers=auth(customer_token), timeout=20)
        assert r_full.status_code == 200
        data = r_full.json()
        assert any(p["id"] == "pl_2" for p in data["parlours"])
        assert "pl_2" in data["ids"]["parlour"]

        # Toggle OFF
        r2 = s.post(f"{API}/favourites/toggle", headers=auth(customer_token),
                    json={"kind": "parlour", "item_id": "pl_2"}, timeout=20)
        assert r2.status_code == 200
        assert r2.json()["favourited"] is False

        r_ids2 = s.get(f"{API}/favourites/ids", headers=auth(customer_token), timeout=20)
        assert "pl_2" not in r_ids2.json()["parlour"]

    def test_toggle_artist(self, s, customer_token):
        r = s.post(f"{API}/favourites/toggle", headers=auth(customer_token),
                   json={"kind": "artist", "item_id": "ar_1"}, timeout=20)
        assert r.status_code == 200
        r_ids = s.get(f"{API}/favourites/ids", headers=auth(customer_token), timeout=20)
        assert "ar_1" in r_ids.json()["artist"]

        # Full listing returns artist objects
        r_full = s.get(f"{API}/favourites", headers=auth(customer_token), timeout=20)
        assert any(a["id"] == "ar_1" for a in r_full.json()["artists"])

        # Clean up (toggle off)
        s.post(f"{API}/favourites/toggle", headers=auth(customer_token),
               json={"kind": "artist", "item_id": "ar_1"}, timeout=20)

    def test_toggle_invalid_kind(self, s, customer_token):
        r = s.post(f"{API}/favourites/toggle", headers=auth(customer_token),
                   json={"kind": "widget", "item_id": "x"}, timeout=20)
        assert r.status_code == 400

    def test_favourites_requires_auth(self, s):
        r = s.get(f"{API}/favourites", timeout=20)
        assert r.status_code == 401


# ---------- Near Me / distance sort ----------
class TestNearMe:
    def test_distance_sort(self, s):
        # LA-ish coords
        r = s.get(f"{API}/parlours", params={"lat": 34.05, "lng": -118.25, "sort": "distance"}, timeout=20)
        assert r.status_code == 200
        parlours = r.json()["parlours"]
        assert len(parlours) >= 2
        # All have distance_km
        assert all("distance_km" in p and isinstance(p["distance_km"], (int, float)) for p in parlours)
        # Sorted ascending
        distances = [p["distance_km"] for p in parlours]
        assert distances == sorted(distances)

    def test_no_distance_without_coords(self, s):
        r = s.get(f"{API}/parlours", timeout=20)
        parlours = r.json()["parlours"]
        assert all("distance_km" not in p for p in parlours)


# ---------- Upload ----------
class TestUpload:
    def test_upload_and_fetch(self, s, customer_token):
        # 1x1 png bytes
        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cf00000003000100"
            "18dd8db60000000049454e44ae426082"
        )
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        r = s.post(f"{API}/upload", headers=auth(customer_token), files=files, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "path" in j and "url" in j
        assert j["url"] == f"/api/files/{j['path']}"

        # Fetch back
        rf = s.get(f"{BASE_URL}{j['url']}", timeout=20)
        assert rf.status_code == 200
        assert rf.headers.get("content-type", "").startswith("image/")
        assert len(rf.content) > 0

    def test_upload_requires_auth(self, s):
        files = {"file": ("x.png", io.BytesIO(b"\x89PNG"), "image/png")}
        r = s.post(f"{API}/upload", files=files, timeout=20)
        assert r.status_code == 401

    def test_missing_file_returns_404(self, s):
        r = s.get(f"{API}/files/nonexistent/path/no.png", timeout=20)
        assert r.status_code == 404


# ---------- Studio (existing artist) ----------
class TestStudioExistingArtist:
    def test_studio_me_artist(self, s, artist_token):
        r = s.get(f"{API}/studio/me", headers=auth(artist_token), timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j["artist"] is not None and j["artist"]["id"] == "ar_1"
        assert j["parlour"] is not None and j["parlour"]["id"] == "pl_1"

    def test_studio_me_customer_returns_null(self, s, customer_token):
        r = s.get(f"{API}/studio/me", headers=auth(customer_token), timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j["artist"] is None and j["parlour"] is None

    def test_earnings_nonzero_for_demo_artist(self, s, artist_token):
        r = s.get(f"{API}/studio/earnings", headers=auth(artist_token), timeout=20)
        assert r.status_code == 200
        e = r.json()
        for k in ("today", "week", "total", "today_count", "week_count", "chart"):
            assert k in e
        assert isinstance(e["chart"], list) and len(e["chart"]) == 7
        assert all({"date", "label", "amount"} <= set(c.keys()) for c in e["chart"])
        # seeded data guarantees non-zero
        assert e["total"] > 0
        assert e["today"] > 0

    def test_earnings_non_artist_returns_400(self, s, customer_token):
        r = s.get(f"{API}/studio/earnings", headers=auth(customer_token), timeout=20)
        assert r.status_code == 400


# ---------- Studio onboarding for NEW artist ----------
class TestStudioOnboarding:
    def _register(self, s, role="customer"):
        email = f"TEST_studio_{uuid.uuid4().hex[:8]}@inkbound.com"
        r = s.post(f"{API}/auth/register",
                   json={"email": email, "password": "Passw0rd!", "name": "TEST New Studio", "role": role},
                   timeout=20)
        assert r.status_code == 200
        return r.json()["session_token"]

    def test_setup_creates_parlour_artist_services_and_promotes_user(self, s):
        tok = self._register(s, "customer")
        # Before: studio/me returns nulls
        r0 = s.get(f"{API}/studio/me", headers=auth(tok), timeout=20)
        assert r0.json()["artist"] is None

        payload = {
            "name": "TEST_New Studio",
            "tagline": "test tagline",
            "address": "1 Test Blvd, LA",
            "latitude": 34.05,
            "longitude": -118.25,
            "styles": ["Fine Line", "Blackwork"],
            "specialty": "Fine Line Specialist",
            "bio": "TEST bio",
        }
        r = s.post(f"{API}/studio/setup", headers=auth(tok), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "parlour_id" in j and "artist_id" in j
        parlour_id, artist_id = j["parlour_id"], j["artist_id"]

        # user now promoted
        me = s.get(f"{API}/auth/me", headers=auth(tok), timeout=20).json()["user"]
        assert me["role"] == "artist" and me["artist_id"] == artist_id

        # studio/me now returns them
        r1 = s.get(f"{API}/studio/me", headers=auth(tok), timeout=20)
        j1 = r1.json()
        assert j1["artist"]["id"] == artist_id
        assert j1["parlour"]["id"] == parlour_id
        assert j1["parlour"]["name"] == "TEST_New Studio"

        # Services created
        rp = s.get(f"{API}/parlours/{parlour_id}", timeout=20).json()
        assert len(rp["services"]) >= 1

        # Portfolio add
        rport = s.post(f"{API}/studio/portfolio", headers=auth(tok),
                       json={"url": "/api/files/test/path.jpg"}, timeout=20)
        assert rport.status_code == 200
        assert "/api/files/test/path.jpg" in rport.json()["portfolio"]

        # Earnings for freshly-created artist -> zeros
        re = s.get(f"{API}/studio/earnings", headers=auth(tok), timeout=20)
        assert re.status_code == 200
        e = re.json()
        assert e["total"] == 0 and e["today"] == 0 and e["week"] == 0

    def test_portfolio_requires_artist(self, s):
        # Fresh customer (no artist_id)
        tok = self._register(s, "customer")
        r = s.post(f"{API}/studio/portfolio", headers=auth(tok),
                   json={"url": "/api/files/x.jpg"}, timeout=20)
        assert r.status_code == 400


# ---------- Checkout 503 ----------
class TestCheckoutDisabled:
    def test_checkout_create_returns_503_without_stripe_key(self, s, customer_token):
        r = s.post(f"{API}/checkout/create",
                   headers=auth(customer_token),
                   json={"booking_id": "bk_anything", "origin_url": "https://tattoo-spots.preview.emergentagent.com"},
                   timeout=20)
        assert r.status_code == 503

    def test_checkout_status_returns_503(self, s, customer_token):
        r = s.get(f"{API}/checkout/status/sess_x", headers=auth(customer_token), timeout=20)
        assert r.status_code == 503
