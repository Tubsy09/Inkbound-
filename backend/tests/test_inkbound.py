"""InkBound backend API tests - auth, discovery, booking, reviews."""
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL"
) else "https://tattoo-spots.preview.emergentagent.com"

API = f"{BASE_URL}/api"

CUSTOMER = {"email": "customer@inkbound.com", "password": "Passw0rd!"}
ARTIST = {"email": "artist@inkbound.com", "password": "Passw0rd!"}


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def customer_token(s):
    r = s.post(f"{API}/auth/login", json=CUSTOMER, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="session")
def artist_token(s):
    r = s.post(f"{API}/auth/login", json=ARTIST, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


# ----- Auth -----
class TestAuth:
    def test_register_customer(self, s):
        email = f"TEST_cust_{uuid.uuid4().hex[:6]}@inkbound.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Test C", "role": "customer"}, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "session_token" in j and j["user"]["role"] == "customer"

    def test_register_artist(self, s):
        email = f"TEST_art_{uuid.uuid4().hex[:6]}@inkbound.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "Test A", "role": "artist"}, timeout=20)
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "artist"

    def test_register_duplicate(self, s):
        r = s.post(f"{API}/auth/register", json={"email": CUSTOMER["email"], "password": "Passw0rd!", "name": "Dup"}, timeout=20)
        assert r.status_code == 409

    def test_login_success_customer(self, s, customer_token):
        assert customer_token

    def test_login_success_artist(self, s, artist_token):
        assert artist_token

    def test_login_bad_password(self, s):
        r = s.post(f"{API}/auth/login", json={"email": CUSTOMER["email"], "password": "wrong"}, timeout=20)
        assert r.status_code == 401

    def test_me_authenticated(self, s, customer_token):
        r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {customer_token}"}, timeout=20)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["email"] == CUSTOMER["email"] and u["role"] == "customer"

    def test_me_no_token(self, s):
        r = s.get(f"{API}/auth/me", timeout=20)
        assert r.status_code == 401

    def test_me_invalid_token(self, s):
        r = s.get(f"{API}/auth/me", headers={"Authorization": "Bearer nope"}, timeout=20)
        assert r.status_code == 401

    def test_artist_me_has_artist_id(self, s, artist_token):
        r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {artist_token}"}, timeout=20)
        u = r.json()["user"]
        assert u["role"] == "artist" and u["artist_id"] == "ar_1"

    def test_logout(self, s):
        r = s.post(f"{API}/auth/login", json=CUSTOMER, timeout=20)
        tok = r.json()["session_token"]
        r2 = s.post(f"{API}/auth/logout", headers={"Authorization": f"Bearer {tok}"}, timeout=20)
        assert r2.status_code == 200
        r3 = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=20)
        assert r3.status_code == 401


# ----- Discovery -----
class TestDiscovery:
    def test_styles(self, s):
        r = s.get(f"{API}/styles", timeout=20)
        assert r.status_code == 200
        styles = r.json()["styles"]
        assert "All" in styles and "Fine Line" in styles

    def test_list_parlours(self, s):
        r = s.get(f"{API}/parlours", timeout=20)
        assert r.status_code == 200
        parlours = r.json()["parlours"]
        assert len(parlours) >= 6
        assert all("_id" not in p for p in parlours)

    def test_list_parlours_style_filter(self, s):
        r = s.get(f"{API}/parlours", params={"style": "Japanese"}, timeout=20)
        assert r.status_code == 200
        pl = r.json()["parlours"]
        assert len(pl) >= 1
        assert all("Japanese" in p["styles"] for p in pl)

    def test_list_parlours_search(self, s):
        r = s.get(f"{API}/parlours", params={"q": "Iron"}, timeout=20)
        assert r.status_code == 200
        pl = r.json()["parlours"]
        assert any("Iron" in p["name"] for p in pl)

    def test_parlour_detail(self, s):
        r = s.get(f"{API}/parlours/pl_1", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j["parlour"]["id"] == "pl_1"
        assert len(j["artists"]) >= 1
        assert len(j["services"]) >= 1
        assert isinstance(j["reviews"], list)

    def test_parlour_not_found(self, s):
        r = s.get(f"{API}/parlours/nope", timeout=20)
        assert r.status_code == 404

    def test_artist_detail(self, s):
        r = s.get(f"{API}/artists/ar_1", timeout=20)
        assert r.status_code == 200
        j = r.json()
        assert j["artist"]["id"] == "ar_1"
        assert j["parlour"]["id"] == "pl_1"
        assert len(j["services"]) >= 1


# ----- Booking + Reviews -----
class TestBookingReview:
    @pytest.fixture(scope="class")
    def future_date(self):
        return (date.today() + timedelta(days=7)).isoformat()

    def test_slots(self, s, future_date):
        r = s.get(f"{API}/bookings/slots", params={"artist_id": "ar_1", "date": future_date}, timeout=20)
        assert r.status_code == 200
        slots = r.json()["slots"]
        assert len(slots) == 9
        assert all("time" in x and "available" in x for x in slots)

    def test_create_booking_unauth(self, s, future_date):
        r = s.post(f"{API}/bookings", json={"artist_id": "ar_1", "service_id": "sv_pl_1_0", "date": future_date, "time": "10:00"}, timeout=20)
        assert r.status_code == 401

    def test_full_booking_flow(self, s, customer_token, artist_token, future_date):
        # find free slot
        rs = s.get(f"{API}/bookings/slots", params={"artist_id": "ar_1", "date": future_date}, timeout=20)
        free = next((x["time"] for x in rs.json()["slots"] if x["available"]), None)
        assert free is not None

        # create booking
        r = s.post(
            f"{API}/bookings",
            headers={"Authorization": f"Bearer {customer_token}"},
            json={"artist_id": "ar_1", "service_id": "sv_pl_1_0", "date": future_date, "time": free, "note": "TEST_booking"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        bk = r.json()["booking"]
        assert bk["status"] == "pending" and bk["artist_id"] == "ar_1"
        booking_id = bk["id"]

        # slot conflict
        r2 = s.post(
            f"{API}/bookings",
            headers={"Authorization": f"Bearer {customer_token}"},
            json={"artist_id": "ar_1", "service_id": "sv_pl_1_0", "date": future_date, "time": free},
            timeout=20,
        )
        assert r2.status_code == 409

        # customer sees booking
        rm = s.get(f"{API}/bookings/me", headers={"Authorization": f"Bearer {customer_token}"}, timeout=20)
        assert rm.status_code == 200
        assert any(b["id"] == booking_id for b in rm.json()["bookings"])

        # artist sees booking
        ra = s.get(f"{API}/bookings/artist", headers={"Authorization": f"Bearer {artist_token}"}, timeout=20)
        assert ra.status_code == 200
        assert any(b["id"] == booking_id for b in ra.json()["bookings"])

        # artist confirms
        rc = s.patch(f"{API}/bookings/{booking_id}/status", headers={"Authorization": f"Bearer {artist_token}"}, json={"status": "confirmed"}, timeout=20)
        assert rc.status_code == 200 and rc.json()["booking"]["status"] == "confirmed"

        # customer cancels
        rx = s.patch(f"{API}/bookings/{booking_id}/status", headers={"Authorization": f"Bearer {customer_token}"}, json={"status": "cancelled"}, timeout=20)
        assert rx.status_code == 200 and rx.json()["booking"]["status"] == "cancelled"

    def test_status_forbidden_other_user(self, s, customer_token, artist_token, future_date):
        # Create as customer, try to confirm as unrelated new user
        rs = s.get(f"{API}/bookings/slots", params={"artist_id": "ar_2", "date": future_date}, timeout=20)
        free = next((x["time"] for x in rs.json()["slots"] if x["available"]), None)
        r = s.post(
            f"{API}/bookings",
            headers={"Authorization": f"Bearer {customer_token}"},
            json={"artist_id": "ar_2", "service_id": "sv_pl_1_0", "date": future_date, "time": free},
            timeout=20,
        )
        assert r.status_code == 200
        bid = r.json()["booking"]["id"]

        # Third-party user
        email = f"TEST_x_{uuid.uuid4().hex[:6]}@inkbound.com"
        rr = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "X"}, timeout=20)
        tok = rr.json()["session_token"]
        rf = s.patch(f"{API}/bookings/{bid}/status", headers={"Authorization": f"Bearer {tok}"}, json={"status": "confirmed"}, timeout=20)
        assert rf.status_code == 403

    def test_review_and_rating_update(self, s, customer_token):
        r = s.post(
            f"{API}/reviews",
            headers={"Authorization": f"Bearer {customer_token}"},
            json={"parlour_id": "pl_3", "rating": 5, "comment": "TEST_review great work"},
            timeout=20,
        )
        assert r.status_code == 200
        rev = r.json()["review"]
        assert rev["rating"] == 5 and rev["parlour_id"] == "pl_3"

        # Verify parlour rating/review_count updated
        pr = s.get(f"{API}/parlours/pl_3", timeout=20)
        p = pr.json()["parlour"]
        assert p["review_count"] >= 1
        assert any("TEST_review" in rv["comment"] for rv in pr.json()["reviews"])
