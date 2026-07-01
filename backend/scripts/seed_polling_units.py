"""
Seed the inec_reference_pus table from the mykeels/inec-polling-units GitHub dataset.

Usage (run from the project root):
    python -m backend.scripts.seed_polling_units

The script downloads JSON data from:
    https://raw.githubusercontent.com/mykeels/inec-polling-units/master/data/

Each state file contains the full hierarchy:
    state → LGAs → wards → polling units

The script is idempotent — already-present INEC codes are skipped via ON CONFLICT DO NOTHING.
"""
import json
import logging
import sys
import time
from urllib.request import urlopen
from urllib.error import URLError

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

# The 37 entries in the mykeels/inec-polling-units repo (36 states + FCT)
_STATE_SLUGS = [
    "abia", "adamawa", "akwa-ibom", "anambra", "bauchi", "bayelsa", "benue",
    "borno", "cross-river", "delta", "ebonyi", "edo", "ekiti", "enugu",
    "fct", "gombe", "imo", "jigawa", "kaduna", "kano", "katsina", "kebbi",
    "kogi", "kwara", "lagos", "nasarawa", "niger", "ogun", "ondo", "osun",
    "oyo", "plateau", "rivers", "sokoto", "taraba", "yobe", "zamfara",
]

_RAW_BASE = (
    "https://raw.githubusercontent.com/mykeels/inec-polling-units/master/data"
)


def _fetch_json(url: str, retries: int = 3) -> dict:
    for attempt in range(1, retries + 1):
        try:
            with urlopen(url, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except URLError as exc:
            if attempt == retries:
                raise
            log.warning("Attempt %d failed (%s) — retrying in 2s…", attempt, exc)
            time.sleep(2)


def _pad(code: str, width: int) -> str:
    return str(code).zfill(width)


def seed(db_session=None):
    """
    Seed the inec_reference_pus table. Accepts an optional SQLAlchemy session;
    if not provided, creates one from the app's database module.
    """
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

        total_inserted = 0
        total_skipped  = 0

        for slug in _STATE_SLUGS:
            url = f"{_RAW_BASE}/{slug}.json"
            log.info("Fetching %s…", url)

            try:
                data = _fetch_json(url)
            except Exception as exc:
                log.error("Failed to fetch %s: %s — skipping.", slug, exc)
                continue

            state_code = _pad(data.get("stateCode") or data.get("code", "00"), 2)
            state_name = (data.get("stateName") or data.get("name", slug)).title()

            lgas = data.get("lgas") or data.get("LGAs") or []
            batch: list[dict] = []

            for lga in lgas:
                lga_code = _pad(lga.get("lgaCode") or lga.get("code", "00"), 2)
                lga_name = (lga.get("lgaName") or lga.get("name", "")).title()

                wards = lga.get("wards") or []
                for ward in wards:
                    ward_code = _pad(ward.get("wardCode") or ward.get("code", "00"), 3)
                    ward_name = (ward.get("wardName") or ward.get("name", "")).title()

                    pus = ward.get("pollingUnits") or ward.get("polling_units") or []
                    for pu in pus:
                        pu_code = _pad(pu.get("puCode") or pu.get("code", "000"), 4)
                        pu_name = (pu.get("puName") or pu.get("name", "")).title()
                        reg_v   = pu.get("registeredVoters") or pu.get("registered_voters")

                        # INEC code format: SS/LL/WWW/PPPP
                        inec_code = f"{state_code}/{lga_code}/{ward_code}/{pu_code}"

                        batch.append({
                            "state_code":        state_code,
                            "state_name":        state_name,
                            "lga_code":          lga_code,
                            "lga_name":          lga_name,
                            "ward_code":         ward_code,
                            "ward_name":         ward_name,
                            "pu_code":           pu_code,
                            "pu_name":           pu_name[:300],
                            "inec_code":         inec_code,
                            "registered_voters": int(reg_v) if reg_v else None,
                        })

            # Upsert in batches of 1000
            BATCH_SIZE = 1000
            for i in range(0, len(batch), BATCH_SIZE):
                chunk = batch[i : i + BATCH_SIZE]
                stmt = pg_insert(INECReferencePU).values(chunk)
                stmt = stmt.on_conflict_do_nothing(index_elements=["inec_code"])
                result = db.execute(stmt)
                inserted = result.rowcount if result.rowcount >= 0 else len(chunk)
                total_inserted += inserted
                total_skipped  += len(chunk) - inserted

            db.commit()
            log.info(
                "  %s: %d PUs processed", state_name, len(batch)
            )

        log.info(
            "Seeding complete. %d inserted, %d skipped (already present).",
            total_inserted, total_skipped,
        )
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
