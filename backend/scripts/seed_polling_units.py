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
            with urlopen(req, timeout=60) as r:
                return r.read()
        except HTTPError as exc:
            if attempt == retries:
                raise
            log.warning("HTTP %s on attempt %d — retrying in 5 s…", exc.code, attempt)
            time.sleep(5)
        except URLError as exc:
            if attempt == retries:
                raise
            log.warning("Network error on attempt %d (%s) — retrying in 5 s…", attempt, exc)
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
    if db_session is None:
        from ..database import SessionLocal
        db = SessionLocal()
        close_after = True
    else:
        db = db_session
        close_after = False

    try:
        from ..models import INECReferencePU
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        log.info("Downloading polling-units.csv from GitHub…")
        raw = _fetch(_CSV_URL)
        log.info("Downloaded %.1f MB — parsing…", len(raw) / 1_048_576)

        rows = _build_rows(raw.decode("utf-8"))
        log.info("Built %d rows. Inserting into DB…", len(rows))

        total_inserted = 0
        total_skipped  = 0
        CHUNK = 1000

        for i in range(0, len(rows), CHUNK):
            chunk = rows[i: i + CHUNK]
            stmt  = pg_insert(INECReferencePU).values(chunk)
            stmt  = stmt.on_conflict_do_nothing(index_elements=["inec_code"])
            result = db.execute(stmt)
            ins = result.rowcount if result.rowcount >= 0 else len(chunk)
            total_inserted += ins
            total_skipped  += len(chunk) - ins

            if (i // CHUNK) % 20 == 0:
                log.info("  …%d / %d rows", i + len(chunk), len(rows))

        db.commit()
        log.info("Done. %d inserted, %d skipped.", total_inserted, total_skipped)
        return {"inserted": total_inserted, "skipped": total_skipped}

    except Exception:
        db.rollback()
        raise
    finally:
        if close_after:
            db.close()


if __name__ == "__main__":
    result = seed()
    sys.exit(0 if result else 1)
