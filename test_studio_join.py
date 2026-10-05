"""InkBound backend tests - artists choosing which studio they work at (join requests + approval)."""
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


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def register(s):
    email = f"TEST_join_{uuid.uuid4().hex[:8]}@inkbound.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Passw0rd!", "name": "TEST Joiner", "role": "customer"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


def make_owner(s):
    """A new user who creates their own studio. Returns (token, parlour_id, artist_id, studio_name)."""
    tok = register(s)
    name = f"TEST Studio {uuid.uuid4().hex[:6]}"
    r = s.post(f"{API}/studio/setup", headers=auth(tok), json={"name": name, "address": "1 Test St", "styles": ["Blackwork"]}, timeout=20)
    assert r.status_code == 200, r.text
    return tok, r.json()["parlour_id"], r.json()["artist_id"], name


def ask(s, tok, parlour_id):
    return s.post(f"{API}/studio/join-requests", headers=auth(tok), json={"parlour_id": parlour_id}, timeout=20)


def respond(s, tok, request_id, approve):
    return s.post(f"{API}/studio/join-requests/{request_id}/respond", headers=auth(tok), json={"approve": approve}, timeout=20)


def me(s, tok):
    return s.get(f"{API}/studio/me", headers=auth(tok), timeout=20).json()


@pytest.fixture()
def studio(s):
    return make_owner(s)


class TestSearch:
    def test_finds_studio_by_name_and_excludes_own(self, s, studio):
        tok, pid, _aid, name = studio
        other = register(s)
        found = s.get(f"{API}/studios/search", params={"q": name}, headers=auth(other), timeout=20).json()["studios"]
        assert [x["id"] for x in found] == [pid]
        assert found[0]["artist_count"] == 1 and found[0]["accepts_requests"] is True
        # the owner doesn't see their own studio in the list
        mine = s.get(f"{API}/studios/search", params={"q": name}, headers=auth(tok), timeout=20).json()["studios"]
        assert mine == []

    def test_search_text_is_not_treated_as_a_pattern(self, s):
        tok = register(s)
        r = s.get(f"{API}/studios/search", params={"q": "(["}, headers=auth(tok), timeout=20)
        assert r.status_code == 200 and r.json()["studios"] == []


class TestJoinFlow:
    def test_new_artist_requests_and_owner_approves(self, s, studio):
        owner, pid, _oaid, _name = studio
        joiner = register(s)

        r = ask(s, joiner, pid)
        assert r.status_code == 200, r.text
        req_id, joiner_artist_id = r.json()["request"]["id"], r.json()["artist_id"]

        # waiting: they're an artist with no studio, and aren't listed anywhere yet
        m = me(s, joiner)
        assert m["parlour"] is None and m["pending_request"]["id"] == req_id
        assert s.get(f"{API}/artists/{joiner_artist_id}", timeout=20).status_code == 404
        assert len(s.get(f"{API}/parlours/{pid}", timeout=20).json()["artists"]) == 1

        # the owner sees it; the joiner can't see or answer requests
        lst = s.get(f"{API}/studio/join-requests", headers=auth(owner), timeout=20).json()
        assert [x["id"] for x in lst["requests"]] == [req_id]
        assert me(s, owner)["pending_requests_count"] == 1
        assert s.get(f"{API}/studio/join-requests", headers=auth(joiner), timeout=20).status_code == 403
        assert respond(s, joiner, req_id, True).status_code == 403

        # approve -> they now work there, but don't own it
        assert respond(s, owner, req_id, True).status_code == 200
        m = me(s, joiner)
        assert m["parlour"]["id"] == pid and m["is_owner"] is False and m["pending_request"] is None
        assert s.get(f"{API}/artists/{joiner_artist_id}", timeout=20).status_code == 200
        assert len(s.get(f"{API}/parlours/{pid}", timeout=20).json()["artists"]) == 2
        assert respond(s, owner, req_id, True).status_code == 409  # already decided

    def test_member_cannot_change_studio_settings(self, s, studio):
        owner, pid, _oaid, name = studio
        joiner = register(s)
        rid = ask(s, joiner, pid).json()["request"]["id"]
        assert respond(s, owner, rid, True).status_code == 200

        assert s.get(f"{API}/studio/services", headers=auth(joiner), timeout=20).status_code == 403
        sv = s.get(f"{API}/studio/services", headers=auth(owner), timeout=20).json()["services"][0]
        put = s.put(f"{API}/studio/services/{sv['id']}", headers=auth(joiner), json={"price": 1}, timeout=20)
        assert put.status_code == 403
        assert s.post(f"{API}/studio/hours", headers=auth(joiner), json={"hours_config": {}}, timeout=20).status_code == 403

        # setup as a member edits their profile only - the studio keeps its name
        r = s.post(f"{API}/studio/setup", headers=auth(joiner), json={"name": "HIJACKED", "address": "x", "bio": "My new bio"}, timeout=20)
        assert r.status_code == 200 and r.json()["parlour_id"] == pid
        assert s.get(f"{API}/parlours/{pid}", timeout=20).json()["parlour"]["name"] == name
        assert me(s, joiner)["artist"]["bio"] == "My new bio"

    def test_decline_then_ask_again(self, s, studio):
        owner, pid, _o, _n = studio
        joiner = register(s)
        rid = ask(s, joiner, pid).json()["request"]["id"]
        assert respond(s, owner, rid, False).status_code == 200
        assert me(s, joiner)["pending_request"] is None and me(s, joiner)["parlour"] is None
        assert ask(s, joiner, pid).status_code == 200

    def test_cancel_own_request_and_duplicates(self, s, studio):
        owner, pid, _o, _n = studio
        _t2, pid2, _a2, _n2 = make_owner(s)
        joiner = register(s)
        assert ask(s, joiner, pid).status_code == 200
        assert ask(s, joiner, pid2).status_code == 409  # one pending request at a time
        assert s.delete(f"{API}/studio/join-requests/me", headers=auth(joiner), timeout=20).json()["cancelled"] == 1
        assert me(s, joiner)["pending_request"] is None
        assert ask(s, joiner, pid2).status_code == 200

    def test_cannot_ask_for_own_or_missing_studio(self, s, studio):
        owner, pid, _o, _n = studio
        assert ask(s, owner, pid).status_code == 400
        assert ask(s, owner, "pl_does_not_exist").status_code == 404

    def test_only_the_right_owner_can_respond(self, s, studio):
        owner, pid, _o, _n = studio
        other_owner, _p2, _a2, _n2 = make_owner(s)
        joiner = register(s)
        rid = ask(s, joiner, pid).json()["request"]["id"]
        assert respond(s, other_owner, rid, True).status_code == 404  # not their studio's request


class TestMovingAndRemoving:
    def test_owner_with_a_team_cannot_move_away(self, s, studio):
        owner, pid, _o, _n = studio
        joiner = register(s)
        assert respond(s, owner, ask(s, joiner, pid).json()["request"]["id"], True).status_code == 200
        _t, pid2, _a, _n2 = make_owner(s)
        assert ask(s, owner, pid2).status_code == 400

    def test_solo_owner_moving_retires_their_empty_studio(self, s, studio):
        solo, solo_pid, _aid, _n = studio
        owner2, pid2, _a2, _n2 = make_owner(s)
        rid = ask(s, solo, pid2).json()["request"]["id"]
        assert respond(s, owner2, rid, True).status_code == 200
        assert me(s, solo)["parlour"]["id"] == pid2
        assert s.get(f"{API}/parlours/{solo_pid}", timeout=20).status_code == 404  # their old, now-empty studio is retired

    def test_owner_removes_a_member(self, s, studio):
        owner, pid, owner_aid, _n = studio
        joiner = register(s)
        r = ask(s, joiner, pid).json()
        assert respond(s, owner, r["request"]["id"], True).status_code == 200
        assert s.post(f"{API}/studio/team/{owner_aid}/remove", headers=auth(owner), timeout=20).status_code == 400  # not yourself
        assert s.post(f"{API}/studio/team/{r['artist_id']}/remove", headers=auth(joiner), timeout=20).status_code == 403
        assert s.post(f"{API}/studio/team/{r['artist_id']}/remove", headers=auth(owner), timeout=20).status_code == 200
        assert me(s, joiner)["parlour"] is None
        assert len(s.get(f"{API}/parlours/{pid}", timeout=20).json()["artists"]) == 1

    def test_upcoming_booking_blocks_moving(self, s, studio):
        owner, pid, _o, _n = studio
        joiner = register(s)
        r = ask(s, joiner, pid).json()
        assert respond(s, owner, r["request"]["id"], True).status_code == 200

        cust = s.post(f"{API}/auth/login", json=CUSTOMER, timeout=20).json()["session_token"]
        svc = s.get(f"{API}/artists/{r['artist_id']}", timeout=20).json()["services"][0]
        booked = False
        for off in range(5, 40):
            d = (date.today() + timedelta(days=off)).isoformat()
            slots = s.get(f"{API}/bookings/slots", params={"artist_id": r["artist_id"], "date": d}, timeout=20).json().get("slots", [])
            free = next((x["time"] for x in slots if x["available"]), None)
            if free:
                b = s.post(f"{API}/bookings", headers=auth(cust), json={"artist_id": r["artist_id"], "service_id": svc["id"], "date": d, "time": free, "note": "TEST_join"}, timeout=20)
                assert b.status_code == 200, b.text
                booked = True
                break
        assert booked, "no free slot"

        _t, pid2, _a, _n2 = make_owner(s)
        blocked = ask(s, joiner, pid2)
        assert blocked.status_code == 400 and "upcoming booking" in blocked.json()["detail"]
