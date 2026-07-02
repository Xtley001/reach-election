"""
Seed the inec_reference_pus table from mykeels/inec-polling-units on GitHub.

Usage (run from the project root):
    python run_seed.py
    # or
    python -m backend.scripts.seed_polling_units

Data lives at:
    https://github.com/mykeels/inec-polling-units/tree/main/states/
Each state dir (e.g. "01-abia") contains one JSON file per LGA or a
single state-level JSON file — we detect the layout automatically.

The script is idempotent: already-present INEC codes are skipped via
ON CONFLICT DO NOTHING.
"""
import json
import logging
import sys
import time
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

_API_BASE  = "https://api.github.com/repos/mykeels/inec-polling-units/contents"
_RAW_BASE  = "https://raw.githubusercontent.com/mykeels/inec-polling-units/main"
_HEADERS   = {"User-Agent": "reach-election-seeder"}


def _api_get(path: str, retries: int = 3) -> list | dict:
    url = f"{_API_BASE}{path}"
    for attempt in range(1, retries + 1):
        try:
            req = Request(url, headers=_HEADERS)
            with urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except HTTPError as exc:
            if exc.code == 403:
                reset = exc.headers.get("X-RateLimit-Reset", "")
                log.warning("GitHub rate-limited. Reset at %s. Waiting 60 s…", reset)
                time.sleep(60)
            elif attempt == retries:
                raise
            else:
                log.warning("Attempt %d failed (%s) — retrying…", attempt, exc)
                time.sleep(2)
        except URLError as exc:
            if attempt == retries:
                raise
            log.warning("Attempt %d failed (%s) — retrying…", attempt, exc)
            time.sleep(2)


def _raw_get(path: str, retries: int = 3) -> dict:
    url = f"{_RAW_BASE}{path}"
    for attempt in range(1, retries + 1):
        try:
            req = Request(url, headers=_HEADERS)
            with urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except (URLError, HTTPError) as exc:
            if attempt == retries:
                raise
            log.warning("Attempt %d failed (%s) — retrying…", attempt, exc)
            time.sleep(2)


def _pad(code, width: int) -> str:
    return str(code).zfill(width)


def _extract_pus(state_data: dict | list, state_code: str, state_name: str) -> list[dict]:
    """Walk whatever shape the JSON is and return flat list of PU dicts."""
    rows: list[dict] = []

    # Normalise top-level: some files are a dict, some a list
    if isinstance(state_data, list):
        lgas = state_data
    else:
        lgas = (
            state_data.get("lgas")
            or state_data.get("LGAs")
            or state_data.get("data")
            or []
        )
        if not lgas:
            # Maybe it IS a single LGA
            lgas = [state_data]

    for lga in lgas:
        if not isinstance(lga, dict):
            continue
        lga_code = _pad(lga.get("lga_id") or lga.get("lgaCode") or lga.get("id") or "0", 2)
        lga_name = (lga.get("lga") or lga.get("lgaName") or lga.get("name") or "").title()

        wards = lga.get("wards") or lga.get("Wards") or []
        for ward in wards:
            if not isinstance(ward, dict):
                continue
            ward_code = _pad(ward.get("ward_id") or ward.get("wardCode") or ward.get("id") or "0", 3)
            ward_name = (ward.get("ward") or ward.get("wardName") or ward.get("name") or "").title()

            pus = (
                ward.get("polling_units")
                or ward.get("pollingUnits")
                or ward.get("units")
                or []
            )
            for pu in pus:
                if not isinstance(pu, dict):
                    continue
                pu_code = _pad(
                    pu.get("polling_unit_id") or pu.get("puCode") or pu.get("id") or "0", 4
                )
                pu_name = (
                    pu.get("polling_unit_name")
                    or pu.get("puName")
                    or pu.get("name")
                    or ""
                ).title()
                reg_v = pu.get("registered_voters") or pu.get("registeredVoters")

                inec_code = f"{state_code}/{lga_code}/{ward_code}/{pu_code}"
                rows.append({
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

        total_inserted = 0
        total_skipped  = 0

        # Discover state directories via GitHub API
        log.info("Fetching state directory listing from GitHub…")
        state_dirs = _api_get("/states")
        state_dirs = [d for d in state_dirs if d["type"] == "dir"]
        log.info("Found %d state directories.", len(state_dirs))

        for state_dir in state_dirs:
            dir_name  = state_dir["name"]          # e.g. "01-abia"
            state_code = dir_name.split("-")[0]     # e.g. "01"
            state_name = dir_name[len(state_code)+1:].replace("-", " ").title()  # e.g. "Abia"

            log.info("Processing %s (%s)…", state_name, dir_name)

            # List files inside the state directory
            try:
                state_files = _api_get(f"/states/{dir_name}")
            except Exception as exc:
                log.error("  Could not list %s: %s — skipping.", dir_name, exc)
                continue

            json_files = [f for f in state_files if f["name"].endswith(".json")]
            if not json_files:
                log.warning("  No JSON files in %s — skipping.", dir_name)
                continue

            batch: list[dict] = []
            for jf in json_files:
                raw_path = f"/states/{dir_name}/{jf['name']}"
                try:
                    data = _raw_get(raw_path)
                except Exception as exc:
                    log.error("  Failed to fetch %s: %s — skipping.", jf["name"], exc)
                    continue

                rows = _extract_pus(data, state_code, state_name)
                batch.extend(rows)

            if not batch:
                log.warning("  No polling units extracted from %s.", dir_name)
                continue

            # Batch upsert
            CHUNK = 1000
            for i in range(0, len(batch), CHUNK):
                chunk = batch[i : i + CHUNK]
                stmt = pg_insert(INECReferencePU).values(chunk)
                stmt = stmt.on_conflict_do_nothing(index_elements=["inec_code"])
                result = db.execute(stmt)
                ins = result.rowcount if result.rowcount >= 0 else len(chunk)
                total_inserted += ins
                total_skipped  += len(chunk) - ins

            db.commit()
            log.info("  %s: %d PUs processed.", state_name, len(batch))

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
