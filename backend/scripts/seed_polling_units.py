"""
Seed the inec_reference_pus table from mykeels/inec-polling-units polling-units.csv.

Single HTTP download — no GitHub API rate limits.

Usage:
    python run_seed.py
    python -m backend.scripts.seed_polling_units

Idempotent: already-present INEC codes are skipped via ON CONFLICT DO NOTHING.
"""
import csv
import io
import logging
import sys
import time
from collections import defaultdict
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

_CSV_URL = (
    "https://raw.githubusercontent.com/mykeels/inec-polling-units"
    "/master/polling-units.csv"
)

# Official INEC state codes (alphabetical by common name)
_STATE_CODE: dict[str, str] = {
    "ABIA": "01", "ADAMAWA": "02", "AKWA IBOM": "03", "ANAMBRA": "04",
    "BAUCHI": "05", "BAYELSA": "06", "BENUE": "07", "BORNO": "08",
    "CROSS RIVER": "09", "DELTA": "10", "EBONYI": "11", "EDO": "12",
    "EKITI": "13", "ENUGU": "14", "GOMBE": "15", "IMO": "16",
    "JIGAWA": "17", "KADUNA": "18", "KANO": "19", "KATSINA": "20",
    "KEBBI": "21", "KOGI": "22", "KWARA": "23", "LAGOS": "24",
    "NASARAWA": "25", "NIGER": "26", "OGUN": "27", "ONDO": "28",
    "OSUN": "29", "OYO": "30", "PLATEAU": "31", "RIVERS": "32",
    "SOKOTO": "33", "TARABA": "34", "YOBE": "35", "ZAMFARA": "36",
    "FCT": "37", "ABUJA": "37",
}


def _fetch(url: str, retries: int = 3) -> bytes:
    for attempt in range(1, retries + 1):
        try:
            req = Request(url, headers={"User-Agent": "reach-election-seeder"})
            with urlopen(req, timeout=30) as r:
                chunks = []
                total = 0
                while True:
                    chunk = r.read(65536)  # 64 KB at a time
                    if not chunk:
                        break
                    chunks.append(chunk)
                    total += len(chunk)
                    if total % (1024 * 1024) < 65536:
                        log.info("  …downloaded %.1f MB", total / 1_048_576)
                return b"".join(chunks)
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            if attempt == retries:
                raise
            log.warning("Attempt %d failed (%s) — retrying in 5 s…", attempt, exc)
            time.sleep(5)


def _build_rows(csv_text: str) -> list[dict]:
    """
    Parse the CSV and assign sequential INEC-style codes.

    Hierarchy: state → lga → ward → pu
    Codes are zero-padded: state(2) / lga(2) / ward(3) / pu(4)
    """
    # tree[state_name][lga_name][ward_name] = [pu_name, ...]
    tree: dict[str, dict[str, dict[str, list[str]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(list))
    )

    reader = csv.DictReader(io.StringIO(csv_text))
    seen: set[tuple] = set()
    for row in reader:
        state = (row.get("state_name") or "").strip().upper()
        lga   = (row.get("local_government_name") or "").strip().upper()
        ward  = (row.get("ward_name") or "").strip().upper()
        pu    = (row.get("name") or "").strip().upper()
        if not (state and lga and ward and pu):
            continue
        key = (state, lga, ward, pu)
        if key in seen:
            continue
        seen.add(key)
        tree[state][lga][ward].append(pu)

    rows: list[dict] = []
    for state_name in sorted(tree):
        state_code = _STATE_CODE.get(state_name, "00")
        for lga_idx, lga_name in enumerate(sorted(tree[state_name]), start=1):
            lga_code = f"{lga_idx:02d}"
            for ward_idx, ward_name in enumerate(sorted(tree[state_name][lga_name]), start=1):
                ward_code = f"{ward_idx:03d}"
                pus = sorted(tree[state_name][lga_name][ward_name])
                for pu_idx, pu_name in enumerate(pus, start=1):
                    pu_code  = f"{pu_idx:04d}"
                    inec_code = f"{state_code}/{lga_code}/{ward_code}/{pu_code}"
                    rows.append({
                        "state_code":        state_code,
                        "state_name":        state_name.title(),
                        "lga_code":          lga_code,
                        "lga_name":          lga_name.title(),
                        "ward_code":         ward_code,
                        "ward_name":         ward_name.title(),
                        "pu_code":           pu_code,
                        "pu_name":           pu_name.title()[:300],
                        "inec_code":         inec_code,
                        "registered_voters": None,
                    })
    return rows


def seed(db_session=None):
    """
    Callable from FastAPI startup (db_session supplied) or standalone via run_seed.py.

    When running standalone, uses psycopg2 directly for reliable bulk inserts —
    avoids SQLAlchemy ORM overhead and session-pooler timeouts.
    """
    import os

    log.info("Downloading polling-units.csv from GitHub…")
    raw = _fetch(_CSV_URL)
    log.info("Downloaded %.1f MB — parsing…", len(raw) / 1_048_576)

    rows = _build_rows(raw.decode("utf-8"))
    log.info("Built %d rows. Inserting into DB…", len(rows))

    if db_session is None:
        return _seed_via_psycopg2(rows, os.environ["DATABASE_URL"])
    else:
        return _seed_via_sqlalchemy(rows, db_session)


def _seed_via_psycopg2(rows: list[dict], db_url: str) -> dict:
    """Direct psycopg2 bulk insert — used for local standalone seeding."""
    import psycopg2
    from psycopg2.extras import execute_values

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    CHUNK = 2000
    total_inserted = 0
    total_skipped  = 0

    try:
        for i in range(0, len(rows), CHUNK):
            chunk = rows[i: i + CHUNK]
            values = [
                (
                    r["state_code"], r["state_name"],
                    r["lga_code"],   r["lga_name"],
                    r["ward_code"],  r["ward_name"],
                    r["pu_code"],    r["pu_name"],
                    r["inec_code"],  r["registered_voters"],
                )
                for r in chunk
            ]
            execute_values(
                cur,
                """
                INSERT INTO inec_reference_pus
                  (state_code, state_name, lga_code, lga_name,
                   ward_code, ward_name, pu_code, pu_name,
                   inec_code, registered_voters)
                VALUES %s
                ON CONFLICT (inec_code) DO NOTHING
                """,
                values,
                page_size=CHUNK,
            )
            inserted = cur.rowcount
            total_inserted += inserted if inserted >= 0 else len(chunk)
            total_skipped  += len(chunk) - (inserted if inserted >= 0 else len(chunk))

            if (i // CHUNK) % 10 == 0:
                log.info("  …%d / %d rows", i + len(chunk), len(rows))

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

    log.info("Done. %d inserted, %d skipped.", total_inserted, total_skipped)
    return {"inserted": total_inserted, "skipped": total_skipped}


def _seed_via_sqlalchemy(rows: list[dict], db) -> dict:
    """SQLAlchemy path — used when called from FastAPI with an existing session."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from ..models import INECReferencePU

    total_inserted = 0
    total_skipped  = 0
    CHUNK = 500

    try:
        for i in range(0, len(rows), CHUNK):
            chunk = rows[i: i + CHUNK]
            stmt  = pg_insert(INECReferencePU).values(chunk)
            stmt  = stmt.on_conflict_do_nothing(index_elements=["inec_code"])
            result = db.execute(stmt)
            ins = result.rowcount if result.rowcount >= 0 else len(chunk)
            total_inserted += ins
            total_skipped  += len(chunk) - ins

        db.commit()
    except Exception:
        db.rollback()
        raise

    log.info("Done. %d inserted, %d skipped.", total_inserted, total_skipped)
    return {"inserted": total_inserted, "skipped": total_skipped}


if __name__ == "__main__":
    result = seed()
    sys.exit(0 if result else 1)
