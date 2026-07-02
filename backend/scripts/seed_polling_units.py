"""
Seed the inec_reference_pus table from mykeels/inec-polling-units on GitHub.

Usage:
    python run_seed.py
    python -m backend.scripts.seed_polling_units

Idempotent: already-present INEC codes are skipped via ON CONFLICT DO NOTHING.
"""
import json
import logging
import sys
import time
from urllib.parse import quote
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)

_API_BASE = "https://api.github.com/repos/mykeels/inec-polling-units/contents"
_HEADERS  = {"User-Agent": "reach-election-seeder"}


def _fetch_url(url: str, retries: int = 3) -> bytes:
    for attempt in range(1, retries + 1):
        try:
            req = Request(url, headers=_HEADERS)
            with urlopen(req, timeout=30) as r:
                return r.read()
        except HTTPError as exc:
            if exc.code == 403:
                reset = exc.headers.get("X-RateLimit-Reset", "unknown")
                log.warning("GitHub rate-limited (reset=%s). Waiting 65 s…", reset)
                time.sleep(65)
            elif attempt == retries:
                raise
            else:
                log.warning("Attempt %d failed (%s) — retrying…", attempt, exc)
                time.sleep(3)
        except URLError as exc:
            if attempt == retries:
                raise
            log.warning("Attempt %d failed (%s) — retrying…", attempt, exc)
            time.sleep(3)


def _api_list(subpath: str) -> list:
    """List contents of a path in the repo. subpath must be already encoded."""
    url = f"{_API_BASE}/{subpath}"
    return json.loads(_fetch_url(url))


def _download(download_url: str) -> dict | list:
    """Download a file using the download_url returned by the GitHub API."""
    return json.loads(_fetch_url(download_url))


def _pad(code, width: int) -> str:
    return str(code).zfill(width)


def _extract_pus(data: dict | list, state_code: str, state_name: str) -> list[dict]:
    rows: list[dict] = []

    if isinstance(data, list):
        lgas = data
    else:
        lgas = (
            data.get("lgas") or data.get("LGAs") or data.get("data") or []
        )
        if not lgas:
            lgas = [data]

    for lga in lgas:
        if not isinstance(lga, dict):
            continue
        lga_code = _pad(
            lga.get("lga_id") or lga.get("lgaCode") or lga.get("id") or "0", 2
        )
        lga_name = (
            lga.get("lga") or lga.get("lgaName") or lga.get("name") or ""
        ).title()

        wards = lga.get("wards") or lga.get("Wards") or []
        for ward in wards:
            if not isinstance(ward, dict):
                continue
            ward_code = _pad(
                ward.get("ward_id") or ward.get("wardCode") or ward.get("id") or "0", 3
            )
            ward_name = (
                ward.get("ward") or ward.get("wardName") or ward.get("name") or ""
            ).title()

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

                rows.append({
                    "state_code":        state_code,
                    "state_name":        state_name,
                    "lga_code":          lga_code,
                    "lga_name":          lga_name,
                    "ward_code":         ward_code,
                    "ward_name":         ward_name,
                    "pu_code":           pu_code,
                    "pu_name":           pu_name[:300],
                    "inec_code":         f"{state_code}/{lga_code}/{ward_code}/{pu_code}",
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

        log.info("Fetching state directory listing…")
        state_dirs = _api_list("states")
        state_dirs = [d for d in state_dirs if d["type"] == "dir"]
        log.info("Found %d state directories.", len(state_dirs))

        for state_dir in state_dirs:
            dir_name   = state_dir["name"]               # e.g. "01-abia"
            state_code = dir_name.split("-")[0]          # e.g. "01"
            state_name = dir_name[len(state_code)+1:].replace("-", " ").title()

            log.info("Processing %s…", state_name)

            # URL-encode the directory name (handles spaces like "03-akwa ibom")
            encoded_dir = quote(dir_name, safe="")
            try:
                state_files = _api_list(f"states/{encoded_dir}")
            except Exception as exc:
                log.error("  Could not list %s: %s — skipping.", dir_name, exc)
                continue

            json_files = [f for f in state_files
                          if isinstance(f, dict) and f.get("name", "").endswith(".json")
                          and f.get("download_url")]
            if not json_files:
                log.warning("  No JSON files in %s — skipping.", dir_name)
                # Log what IS there to help diagnose
                names = [f.get("name") for f in state_files[:5] if isinstance(f, dict)]
                log.warning("  Contents: %s", names)
                continue

            batch: list[dict] = []
            for jf in json_files:
                log.info("  Fetching %s…", jf["name"])
                try:
                    # Use download_url from API — correct branch + encoding built in
                    data = _download(jf["download_url"])
                except Exception as exc:
                    log.error("  Failed %s: %s — skipping.", jf["name"], exc)
                    continue
                rows = _extract_pus(data, state_code, state_name)
                batch.extend(rows)

            if not batch:
                log.warning("  No PUs extracted from %s.", dir_name)
                continue

            CHUNK = 1000
            for i in range(0, len(batch), CHUNK):
                chunk = batch[i: i + CHUNK]
                stmt = pg_insert(INECReferencePU).values(chunk)
                stmt = stmt.on_conflict_do_nothing(index_elements=["inec_code"])
                result = db.execute(stmt)
                ins = result.rowcount if result.rowcount >= 0 else len(chunk)
                total_inserted += ins
                total_skipped  += len(chunk) - ins

            db.commit()
            log.info("  %s: %d PUs.", state_name, len(batch))

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
