"""2026-11-28: several authenticator apps on one admin login.

The admins share one admin login; each person adds their own phone once, and
a code from any active phone (or a backup code) completes the login. Adding
and removing a phone need the account password."""

import json
from datetime import datetime, timedelta, timezone

import pyotp
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.rate_limit import limiter
from app.core.security import create_two_factor_challenge_token, hash_password
from app.database import Base, get_db
from app.dependencies import get_current_user
from app.models import User, UserTotpDevice

PASSWORD = "Admin#Pass2026"
FIRST_SECRET = pyotp.random_base32()


@pytest.fixture()
def world():
    engine = create_engine("sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    admin = User(
        id="admin-1",
        full_name="MathPath Admin",
        email="admin@example.test",
        password_hash=hash_password(PASSWORD),
        role="SUPER_ADMIN",
        is_active=True,
        totp_enabled=True,
        totp_secret=FIRST_SECRET,
        totp_backup_codes_json=json.dumps([hash_password("aaaa1111-bb22")]),
    )
    teacher = User(id="teacher-1", full_name="Teacher", email="t@example.test", password_hash=hash_password(PASSWORD), role="TEACHER", is_active=True)
    db.add_all([admin, teacher])
    db.commit()

    from app.main import app

    current = {"user": admin}
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current["user"]
    was_enabled = limiter.enabled
    limiter.enabled = False
    try:
        yield db, admin, current, TestClient(app)
    finally:
        limiter.enabled = was_enabled
        app.dependency_overrides.clear()


def _code(secret):
    return pyotp.TOTP(secret).now()


def _login(client, code):
    token = create_two_factor_challenge_token("admin-1")
    return client.post("/api/auth/2fa/verify-login", json={"challengeToken": token, "code": code})


def _add_phone(client, label="Riya's phone"):
    started = client.post("/api/auth/2fa/devices", json={"label": label, "password": PASSWORD})
    assert started.status_code == 200, started.text
    body = started.json()
    assert body["qrCodeDataUrl"].startswith("data:image/png;base64,") and body["secret"]
    confirmed = client.post(f"/api/auth/2fa/devices/{body['deviceId']}/confirm", json={"code": _code(body["secret"])})
    assert confirmed.status_code == 200, confirmed.text
    return body, confirmed.json()


def test_the_existing_authenticator_becomes_the_first_phone(world):
    db, admin, _, client = world
    listed = client.get("/api/auth/2fa/devices").json()
    assert listed["enabled"] is True
    assert [d["label"] for d in listed["devices"]] == ["First authenticator"]
    assert listed["devices"][0]["lastUsedAt"] is None
    assert _login(client, _code(FIRST_SECRET)).status_code == 200
    assert client.get("/api/auth/2fa/devices").json()["devices"][0]["lastUsedAt"] is not None


def test_a_second_phone_logs_in_and_the_first_still_does(world):
    db, admin, _, client = world
    started, confirmed = _add_phone(client)
    assert [d["label"] for d in confirmed["devices"]] == ["First authenticator", "Riya's phone"]
    assert _login(client, _code(started["secret"])).status_code == 200
    assert _login(client, _code(FIRST_SECRET)).status_code == 200
    assert _login(client, "000000").status_code == 401


def test_adding_a_phone_needs_the_password_a_name_and_a_code_from_it(world):
    db, admin, _, client = world
    bad = client.post("/api/auth/2fa/devices", json={"label": "Riya's phone", "password": "wrong"})
    assert bad.status_code == 400 and bad.json()["detail"]["code"] == "INVALID_PASSWORD"
    nameless = client.post("/api/auth/2fa/devices", json={"label": "   ", "password": PASSWORD})
    assert nameless.status_code == 422 and nameless.json()["detail"]["code"] == "DEVICE_LABEL_REQUIRED"
    taken = client.post("/api/auth/2fa/devices", json={"label": "first AUTHENTICATOR", "password": PASSWORD})
    assert taken.status_code == 409 and taken.json()["detail"]["code"] == "DEVICE_LABEL_TAKEN"
    started = client.post("/api/auth/2fa/devices", json={"label": "Riya's phone", "password": PASSWORD}).json()
    wrong = client.post(f"/api/auth/2fa/devices/{started['deviceId']}/confirm", json={"code": "000000"})
    assert wrong.status_code == 400 and wrong.json()["detail"]["code"] == "INVALID_CODE"
    # Not confirmed: it is not listed and its codes do not log in.
    assert len(client.get("/api/auth/2fa/devices").json()["devices"]) == 1
    assert _login(client, _code(started["secret"])).status_code == 401


def test_only_the_newest_qr_code_can_be_confirmed_and_it_expires(world):
    db, admin, _, client = world
    old = client.post("/api/auth/2fa/devices", json={"label": "Phone A", "password": PASSWORD}).json()
    new = client.post("/api/auth/2fa/devices", json={"label": "Phone B", "password": PASSWORD}).json()
    gone = client.post(f"/api/auth/2fa/devices/{old['deviceId']}/confirm", json={"code": _code(old["secret"])})
    assert gone.status_code == 404
    row = db.get(UserTotpDevice, new["deviceId"])
    row.created_at = datetime.now(timezone.utc) - timedelta(minutes=31)
    db.commit()
    expired = client.post(f"/api/auth/2fa/devices/{new['deviceId']}/confirm", json={"code": _code(new["secret"])})
    assert expired.status_code == 410 and expired.json()["detail"]["code"] == "DEVICE_SETUP_EXPIRED"


def test_a_removed_phone_stops_working_and_the_last_one_stays(world):
    db, admin, _, client = world
    started, confirmed = _add_phone(client)
    first_id = confirmed["devices"][0]["deviceId"]
    bad = client.post(f"/api/auth/2fa/devices/{first_id}/remove", json={"password": "wrong"})
    assert bad.status_code == 400
    removed = client.post(f"/api/auth/2fa/devices/{first_id}/remove", json={"password": PASSWORD})
    assert removed.status_code == 200 and [d["label"] for d in removed.json()["devices"]] == ["Riya's phone"]
    assert _login(client, _code(FIRST_SECRET)).status_code == 401
    assert _login(client, _code(started["secret"])).status_code == 200
    # The account's own secret now points at a phone that is still active.
    db.refresh(admin)
    assert admin.totp_secret == started["secret"]
    last = client.post(f"/api/auth/2fa/devices/{started['deviceId']}/remove", json={"password": PASSWORD})
    assert last.status_code == 409 and last.json()["detail"]["code"] == "LAST_DEVICE"


def test_rename_and_backup_codes(world):
    db, admin, _, client = world
    first_id = client.get("/api/auth/2fa/devices").json()["devices"][0]["deviceId"]
    renamed = client.patch(f"/api/auth/2fa/devices/{first_id}", json={"label": "Shailesh's phone"})
    assert renamed.status_code == 200 and renamed.json()["devices"][0]["label"] == "Shailesh's phone"
    assert _login(client, "aaaa1111-bb22").status_code == 200
    assert _login(client, "aaaa1111-bb22").status_code == 401  # used once


def test_setup_again_cannot_replace_every_phone(world):
    db, admin, _, client = world
    again = client.post("/api/auth/2fa/setup")
    assert again.status_code == 409 and again.json()["detail"]["code"] == "TWO_FACTOR_ALREADY_ON"
    db.refresh(admin)
    assert admin.totp_secret == FIRST_SECRET and admin.totp_pending_secret is None


def test_turning_2fa_off_and_on_starts_a_fresh_list(world):
    db, admin, _, client = world
    started, _ = _add_phone(client)
    assert client.post("/api/auth/2fa/disable", json={"password": PASSWORD}).status_code == 200
    setup = client.post("/api/auth/2fa/setup").json()
    enabled = client.post("/api/auth/2fa/enable", json={"code": _code(setup["secret"])})
    assert enabled.status_code == 200
    listed = client.get("/api/auth/2fa/devices").json()["devices"]
    assert [d["label"] for d in listed] == ["First authenticator"]
    assert _login(client, _code(started["secret"])).status_code == 401
    assert _login(client, _code(setup["secret"])).status_code == 200


def test_only_admins_manage_phones(world):
    db, admin, current, client = world
    current["user"] = db.get(User, "teacher-1")
    assert client.get("/api/auth/2fa/devices").status_code == 403
    assert client.post("/api/auth/2fa/devices", json={"label": "x", "password": PASSWORD}).status_code == 403


def test_startup_backfill_makes_the_first_phone_once(world):
    from app.services.two_factor_devices import BackfillFirstDevices

    db, admin, _, client = world
    assert BackfillFirstDevices(db) == 1
    assert BackfillFirstDevices(db) == 0
    rows = db.query(UserTotpDevice).filter(UserTotpDevice.user_id == "admin-1").all()
    assert len(rows) == 1 and rows[0].secret == FIRST_SECRET and rows[0].confirmed_at is not None
