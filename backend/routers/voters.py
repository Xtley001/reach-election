"""Phase 4 — Voters router"""
import csv, io
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, text

from ..database import get_db
from ..models import (
    Voter, VoterContact, User, UserRole, PollingUnit, Zone, AuditLog,
    ContactStatus, PvcStatus, SupportLevel, RecruitmentSource,
    VoterImport, INECReferencePU,
)
from ..dependencies import (
    require_director, require_coordinator, require_agent,
    get_current_user, assert_zone_access, log_action,
)
from ..schemas import (
    AddVoterRequest, UpdateVoterRequest, LogContactRequest,
    ResolveDuplicateRequest, ClaimVoterRequest,
)

router = APIRouter(tags=["voters"])

E164_RE = __import__('re').compile(r'^\+[1-9]\d{7,14}$')

VALID_STATUSES  = {s.value for s in ContactStatus}
VALID_PVC       = {s.value for s in PvcStatus}
VALID_SUPPORT   = {s.value for s in SupportLevel}
VALID_SOURCES   = {s.value for s in RecruitmentSource}
VALID_AGE       = {'18-25','26-35','36-50','51+'}
VALID_GENDER    = {'male','female','other'}
VALID_CHANNELS  = {'call','visit','whatsapp','sms','other'}


def _voter_out(v: Voter, pu_name: str = None, zone_name: str = None) -> dict:
    return {
        "id":                  str(v.id),
        "campaign_id":         str(v.campaign_id),
        "zone_id":             str(v.zone_id),
        "polling_unit_id":     str(v.polling_unit_id),
        "added_by":            str(v.added_by),
        "name":                v.name,
        "phone":               v.phone,
        "pvc_status":          v.pvc_status,
        "support_level":       v.support_level,
        "current_status":      v.current_status,
        "recruitment_source":  v.recruitment_source,
        "age_range":           v.age_range,
        "gender":              v.gender,
        "notes":               v.notes,
        "vin":                 v.vin,
        "is_seeded":           v.is_seeded,
        "is_claimed":          v.is_seeded and v.phone is not None,
        "is_duplicate_flag":   v.is_duplicate_flag,
        "duplicate_of":        str(v.duplicate_of) if v.duplicate_of else None,
        "created_at":          v.created_at.isoformat(),
        "deleted_at":          v.deleted_at.isoformat() if v.deleted_at else None,
        # denormalised for search results (populated when joining PU/Zone)
        "polling_unit_name":   pu_name,
        "zone_name":           zone_name,
    }


# ─── Voter search (for search-first add flow) ─────────────────────────────────

@router.get("/voters/search")
async def search_voters(
    q: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """
    Full-text name search within the agent's zone.
    Returns seeded (unclaimed) voters first, then already-tracked voters.
    Minimum 2 characters required to avoid full-table scans.
    """
    q = q.strip()
    if len(q) < 2:
        return {"results": [], "total": 0}

    term = f"%{q}%"
    rows = (
        db.query(Voter, PollingUnit, Zone)
        .join(PollingUnit, Voter.polling_unit_id == PollingUnit.id)
        .join(Zone, Voter.zone_id == Zone.id)
        .filter(
            Voter.campaign_id == current_user.campaign_id,
            Voter.zone_id == current_user.zone_id,
            Voter.deleted_at.is_(None),
            Voter.name.ilike(term),
        )
        .order_by(
            # Unclaimed seeded voters first (is_seeded=True, phone=None)
            Voter.is_seeded.desc(),
            Voter.name.asc(),
        )
        .limit(15)
        .all()
    )

    return {
        "results": [
            _voter_out(v, pu_name=pu.name, zone_name=z.name)
            for v, pu, z in rows
        ],
        "total": len(rows),
    }


# ─── INEC reference PU lookup (for territory seeding) ────────────────────────

@router.get("/voters/inec-reference")
async def search_inec_reference(
    state: str = "",
    lga: str = "",
    ward: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    """Search the national INEC reference PU table. Director only."""
    if not state:
        raise HTTPException(400, "state is required.")

    q = db.query(INECReferencePU).filter(
        INECReferencePU.state_name.ilike(f"%{state}%")
    )
    if lga:
        q = q.filter(INECReferencePU.lga_name.ilike(f"%{lga}%"))
    if ward:
        q = q.filter(INECReferencePU.ward_name.ilike(f"%{ward}%"))

    rows = q.order_by(
        INECReferencePU.lga_name, INECReferencePU.ward_name, INECReferencePU.pu_name
    ).limit(200).all()

    return {
        "results": [
            {
                "id":                str(r.id),
                "inec_code":         r.inec_code,
                "pu_name":           r.pu_name,
                "ward_name":         r.ward_name,
                "lga_name":          r.lga_name,
                "state_name":        r.state_name,
                "registered_voters": r.registered_voters,
            }
            for r in rows
        ],
        "total": len(rows),
    }


# ─── Claim a seeded voter (agent adds phone + support) ───────────────────────

@router.patch("/voters/{voter_id}/claim")
async def claim_voter(
    voter_id: str,
    body: ClaimVoterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """
    An agent confirms a pre-seeded INEC voter by supplying their phone number
    and support level. Transfers ownership (added_by) to the claiming agent.
    """
    v = db.query(Voter).filter(
        Voter.id == voter_id,
        Voter.campaign_id == current_user.campaign_id,
        Voter.zone_id == current_user.zone_id,   # must be in agent's zone
        Voter.is_seeded == True,
        Voter.deleted_at.is_(None),
    ).first()
    if not v:
        raise HTTPException(404, "Seeded voter not found in your zone.")

    if v.phone is not None:
        raise HTTPException(409, "This voter has already been claimed by another agent.")

    phone = body.phone.strip()

    # Check that no other agent already tracked this phone in this campaign
    existing = db.query(Voter).filter(
        Voter.campaign_id == current_user.campaign_id,
        Voter.phone == phone,
        Voter.deleted_at.is_(None),
    ).first()
    if existing:
        raise HTTPException(
            409,
            f"Phone {phone} is already tracked (voter ID: {existing.id})."
        )

    v.phone              = phone
    v.support_level      = body.support_level
    v.pvc_status         = body.pvc_status
    v.added_by           = current_user.id
    v.recruitment_source = RecruitmentSource.house_visit
    if body.age_range:  v.age_range = body.age_range
    if body.gender:     v.gender    = body.gender
    if body.notes:      v.notes     = body.notes

    # Create an initial contact log so the voter's status advances
    contact = VoterContact(
        voter_id=voter_id,
        agent_id=current_user.id,
        campaign_id=current_user.campaign_id,
        status_set=ContactStatus.contacted,
        channel="visit",
    )
    db.add(contact)
    v.current_status = ContactStatus.contacted

    log_action(db, current_user, "voter.claimed", "voter", voter_id,
               metadata={"vin": v.vin, "phone": phone})
    db.commit()
    db.refresh(v)

    pu = db.query(PollingUnit).filter(PollingUnit.id == v.polling_unit_id).first()
    z  = db.query(Zone).filter(Zone.id == v.zone_id).first()
    return _voter_out(v, pu_name=pu.name if pu else None, zone_name=z.name if z else None)


# ─── INEC voter register CSV import (director only) ──────────────────────────

_INEC_CSV_ALIASES = {
    "vin":       ["vin", "voter_id", "voter identification number", "nin"],
    "surname":   ["surname", "last name", "last_name", "family name"],
    "firstname": ["first name", "first_name", "firstname", "given name"],
    "othername": ["other names", "other_names", "othername", "middle name", "middle_name"],
    "gender":    ["gender", "sex"],
    "pu_code":   ["polling unit code", "pu code", "pu_code", "polling_unit_code", "pucode"],
    "pu_name":   ["polling unit", "polling unit name", "pu name", "pu_name"],
}


def _detect_col(fieldnames: list[str], field_key: str) -> str | None:
    """Find the CSV column that matches one of the known aliases for `field_key`."""
    aliases = _INEC_CSV_ALIASES.get(field_key, [])
    for fn in fieldnames:
        if fn.strip().lower() in aliases:
            return fn
    return None


def _infer_gender(raw: str) -> str | None:
    r = raw.strip().lower()
    if r in ("m", "male"):   return "male"
    if r in ("f", "female"): return "female"
    return None


@router.post("/voters/import/inec")
async def import_inec_voters(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    """
    Import voters from an INEC voter register CSV.
    The CSV must have at minimum: Surname, First Name, Polling Unit Code.
    VIN, Gender, and Other Names are used when present.
    Polling units must already exist in the campaign (via territory setup).
    """
    MAX_BYTES = 20 * 1024 * 1024  # 20 MB — INEC constituency registers can be large
    content = await file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "File too large. Maximum 20 MB.")

    try:
        text_content = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text_content = content.decode("latin-1")
        except Exception:
            raise HTTPException(400, "Could not decode file. Please save as UTF-8.")

    reader     = csv.DictReader(io.StringIO(text_content))
    fieldnames = [f.strip() for f in (reader.fieldnames or [])]
    if not fieldnames:
        raise HTTPException(400, "CSV appears to be empty or has no header row.")

    # Detect column mapping
    col_vin       = _detect_col(fieldnames, "vin")
    col_surname   = _detect_col(fieldnames, "surname")
    col_firstname = _detect_col(fieldnames, "firstname")
    col_othername = _detect_col(fieldnames, "othername")
    col_gender    = _detect_col(fieldnames, "gender")
    col_pu_code   = _detect_col(fieldnames, "pu_code")

    if not col_surname and not col_firstname:
        raise HTTPException(
            400,
            "CSV must contain a name column (e.g. 'Surname' or 'First Name'). "
            f"Detected columns: {fieldnames[:10]}"
        )
    if not col_pu_code:
        raise HTTPException(
            400,
            "CSV must contain a polling unit code column (e.g. 'Polling Unit Code'). "
            f"Detected columns: {fieldnames[:10]}"
        )

    # Pre-load campaign PUs indexed by inec_code
    pu_map: dict[str, PollingUnit] = {
        pu.inec_code.strip(): pu
        for pu in db.query(PollingUnit).filter(
            PollingUnit.campaign_id == current_user.campaign_id,
            PollingUnit.inec_code.isnot(None),
        ).all()
        if pu.inec_code
    }
    if not pu_map:
        raise HTTPException(
            400,
            "No polling units with INEC codes found in this campaign. "
            "Please set up territory with INEC codes before importing voters."
        )

    # Existing VINs in campaign (to skip re-imports)
    existing_vins: set[str] = {
        v.vin for v in
        db.query(Voter.vin).filter(
            Voter.campaign_id == current_user.campaign_id,
            Voter.vin.isnot(None),
        ).all()
        if v.vin
    }

    # Create import tracking record
    import_record = VoterImport(
        campaign_id=current_user.campaign_id,
        imported_by=current_user.id,
        filename=file.filename or "inec_import.csv",
    )
    db.add(import_record)
    db.flush()

    imported, skipped, error_count = 0, 0, 0
    error_detail: list[dict] = []

    rows = list(reader)
    import_record.total_rows = len(rows)

    BATCH = 500
    for i, raw_row in enumerate(rows, start=2):
        row = {k.strip(): (v.strip() if v else "") for k, v in raw_row.items()}

        # Build full name
        parts = []
        if col_surname   and row.get(col_surname):   parts.append(row[col_surname].title())
        if col_firstname and row.get(col_firstname):  parts.append(row[col_firstname].title())
        if col_othername and row.get(col_othername):  parts.append(row[col_othername].title())
        full_name = " ".join(parts).strip()
        if not full_name:
            error_detail.append({"row": i, "error": "No name found."})
            error_count += 1
            continue

        # VIN
        vin = (row.get(col_vin, "") if col_vin else "").strip().upper() or None

        # Skip if VIN already imported
        if vin and vin in existing_vins:
            skipped += 1
            continue

        # Polling unit lookup
        raw_pu_code = row.get(col_pu_code, "").strip()
        pu = pu_map.get(raw_pu_code)
        if not pu:
            error_detail.append({
                "row": i,
                "error": f"Polling unit code '{raw_pu_code}' not found in campaign.",
            })
            error_count += 1
            continue

        gender = _infer_gender(row.get(col_gender, "") if col_gender else "")

        db.add(Voter(
            campaign_id=current_user.campaign_id,
            zone_id=pu.zone_id,
            polling_unit_id=pu.id,
            added_by=current_user.id,
            name=full_name[:200],
            phone=None,           # no phone in INEC data
            is_seeded=True,
            vin=vin,
            voter_import_id=import_record.id,
            gender=gender,
            recruitment_source=RecruitmentSource.csv_import,
        ))

        if vin:
            existing_vins.add(vin)
        imported += 1

        if imported % BATCH == 0:
            db.flush()  # periodic flush to avoid huge memory buffers

    import_record.imported    = imported
    import_record.skipped     = skipped
    import_record.errors      = error_count
    import_record.status      = "completed"
    import_record.completed_at = datetime.now(timezone.utc)
    if error_detail:
        import_record.error_detail = {"errors": error_detail[:100]}

    log_action(
        db, current_user, "voter.inec_import",
        entity_type="voter_import", entity_id=str(import_record.id),
        metadata={"imported": imported, "skipped": skipped, "errors": error_count},
    )
    db.commit()

    return {
        "import_id": str(import_record.id),
        "imported":  imported,
        "skipped":   skipped,
        "errors":    error_count,
        "total_rows": len(rows),
        "error_sample": error_detail[:10],
        "detail":    f"Import complete. {imported} voters seeded, {skipped} skipped, {error_count} errors.",
    }


@router.get("/voters/imports")
async def list_imports(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    """Import history for this campaign."""
    rows = db.query(VoterImport).filter(
        VoterImport.campaign_id == current_user.campaign_id,
    ).order_by(VoterImport.created_at.desc()).limit(20).all()

    return [
        {
            "id":           str(r.id),
            "filename":     r.filename,
            "total_rows":   r.total_rows,
            "imported":     r.imported,
            "skipped":      r.skipped,
            "errors":       r.errors,
            "status":       r.status,
            "created_at":   r.created_at.isoformat(),
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in rows
    ]


# ─── 4.1  POST /voters ────────────────────────────────────────────────────────

@router.post("/voters")
async def add_voter(
    body: AddVoterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    pu = db.query(PollingUnit).filter(
        PollingUnit.id == body.polling_unit_id,
        PollingUnit.campaign_id == current_user.campaign_id,
    ).first()
    if not pu:
        raise HTTPException(404, "Polling unit not found.")

    # Scope check: agent/coordinator must add to own zone
    if current_user.role != UserRole.director:
        assert_zone_access(current_user, str(pu.zone_id))

    phone = body.phone.strip()

    # Check same-agent duplicate → 409
    same_agent_dup = db.query(Voter).filter(
        Voter.campaign_id == current_user.campaign_id,
        Voter.phone == phone,
        Voter.added_by == current_user.id,
        Voter.deleted_at.is_(None),
    ).first()
    if same_agent_dup:
        raise HTTPException(409, "You already logged this voter.")

    # Cross-agent duplicate — create, but flag
    cross_dup = db.query(Voter).filter(
        Voter.campaign_id == current_user.campaign_id,
        Voter.phone == phone,
        Voter.deleted_at.is_(None),
    ).first()

    if body.pvc_status not in VALID_PVC:
        raise HTTPException(400, f"pvc_status must be one of {sorted(VALID_PVC)}.")
    if body.support_level not in VALID_SUPPORT:
        raise HTTPException(400, f"support_level must be one of {sorted(VALID_SUPPORT)}.")
    if body.recruitment_source and body.recruitment_source not in VALID_SOURCES:
        raise HTTPException(400, f"recruitment_source must be one of {sorted(VALID_SOURCES)}.")
    if body.age_range and body.age_range not in VALID_AGE:
        raise HTTPException(400, f"age_range must be one of {sorted(VALID_AGE)}.")
    if body.gender and body.gender not in VALID_GENDER:
        raise HTTPException(400, f"gender must be one of {sorted(VALID_GENDER)}.")

    voter = Voter(
        campaign_id=current_user.campaign_id,
        zone_id=pu.zone_id,
        polling_unit_id=pu.id,
        added_by=current_user.id,
        name=body.name.strip(),
        phone=phone,
        pvc_status=body.pvc_status,
        support_level=body.support_level,
        recruitment_source=body.recruitment_source or None,
        age_range=body.age_range or None,
        gender=body.gender or None,
        notes=body.notes or None,
        is_duplicate_flag=bool(cross_dup),
        duplicate_of=cross_dup.id if cross_dup else None,
    )
    db.add(voter)
    db.flush()

    if cross_dup:
        log_action(db, current_user, "voter.duplicate_flagged", "voter", str(voter.id),
                   metadata={"original_voter_id": str(cross_dup.id), "phone": phone})

    log_action(db, current_user, "voter.added", "voter", str(voter.id))
    db.commit()
    db.refresh(voter)
    return _voter_out(voter)


# ─── 4.2  POST /voters/bulk ───────────────────────────────────────────────────

MAX_CSV_BYTES = 5 * 1024 * 1024  # 5 MB — generous for a 5000-row CSV (audit 3.5)


@router.post("/voters/bulk")
async def bulk_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    content = await file.read(MAX_CSV_BYTES + 1)
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(413, f"File too large. Maximum size is {MAX_CSV_BYTES // (1024*1024)} MB.")
    try:
        text = content.decode("utf-8-sig")
    except Exception:
        raise HTTPException(400, "File must be UTF-8 encoded.")

    reader = csv.DictReader(io.StringIO(text))
    required_cols = {"name","phone","polling_unit_name"}
    if not reader.fieldnames or not required_cols.issubset({f.strip().lower() for f in reader.fieldnames}):
        raise HTTPException(400, f"CSV must have columns: name, phone, polling_unit_name (optional: pvc_status, support_level, age_range, gender, notes)")

    rows = [{k.strip().lower(): (v.strip() if v else "") for k,v in row.items()} for row in reader]

    # 5000-row hard cap — rejected before any processing
    if len(rows) > 5000:
        raise HTTPException(400, f"CSV has {len(rows)} rows. Maximum is 5000.")
    if not rows:
        raise HTTPException(400, "CSV is empty.")

    # Pre-load polling units for this campaign
    pus = {pu.name.lower(): pu for pu in
           db.query(PollingUnit).filter(PollingUnit.campaign_id == current_user.campaign_id).all()}

    # Existing phones in campaign (for dup detection)
    existing_phones = {v.phone for v in
                       db.query(Voter.phone).filter(
                           Voter.campaign_id == current_user.campaign_id,
                           Voter.deleted_at.is_(None),
                       ).all()}

    # Validate ALL rows before any inserts
    errors = []
    for i, row in enumerate(rows, start=2):
        if not row.get("name"): errors.append({"row":i,"error":"name is required."})
        ph = row.get("phone","")
        if not ph: errors.append({"row":i,"error":"phone is required."})
        elif not E164_RE.match(ph): errors.append({"row":i,"error":f"phone '{ph}' is not E.164."})
        pu_name = row.get("polling_unit_name","")
        if not pu_name or pu_name.lower() not in pus:
            errors.append({"row":i,"error":f"polling_unit '{pu_name}' not found."})

    if errors:
        return {"success":False,"imported":0,"skipped":0,"errors":errors[:20]}

    # Commit all valid rows
    imported, skipped = 0, 0
    for row in rows:
        ph = row["phone"]
        if ph in existing_phones:
            skipped += 1
            continue
        pu = pus[row["polling_unit_name"].lower()]

        if current_user.role != UserRole.director:
            if str(pu.zone_id) != str(current_user.zone_id):
                skipped += 1
                continue

        db.add(Voter(
            campaign_id=current_user.campaign_id,
            zone_id=pu.zone_id,
            polling_unit_id=pu.id,
            added_by=current_user.id,
            name=row["name"],
            phone=ph,
            pvc_status=row.get("pvc_status","unknown") if row.get("pvc_status") in VALID_PVC else "unknown",
            support_level=row.get("support_level","unknown") if row.get("support_level") in VALID_SUPPORT else "unknown",
            age_range=row.get("age_range") if row.get("age_range") in VALID_AGE else None,
            gender=row.get("gender") if row.get("gender") in VALID_GENDER else None,
            notes=row.get("notes","")[:500] or None,
        ))
        existing_phones.add(ph)
        imported += 1

    log_action(db, current_user, "voter.bulk_import", metadata={"imported":imported,"skipped":skipped})
    db.commit()
    return {"success":True,"imported":imported,"skipped":skipped,"errors":[]}


# ─── 4.3  GET /voters ─────────────────────────────────────────────────────────

@router.get("/voters/template")
async def download_template(current_user: User = Depends(require_agent)):
    content = "name,phone,polling_unit_name,pvc_status,support_level,age_range,gender,notes\n"
    content += "Aisha Bello,+2348012345678,Oke-Ado PU 001,has_pvc,strong_supporter,26-35,female,\n"
    content += "Emeka Obi,+2348087654321,Sango PU 002,unknown,undecided,36-50,male,Lives near market\n"
    return StreamingResponse(
        iter([content]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=voters_template.csv"},
    )


@router.get("/voters/queue")
async def get_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    # Priority: unreached(1) → pvc_issue(2) → needs_follow_up(3) → no_answer(4) → confirmed_voter(5)
    priority_case = text("""
        CASE current_status
            WHEN 'unreached'       THEN 1
            WHEN 'pvc_issue'       THEN 2
            WHEN 'needs_follow_up' THEN 3
            WHEN 'no_answer'       THEN 4
            WHEN 'confirmed_voter' THEN 5
            ELSE 99
        END
    """)
    q = db.query(Voter).filter(
        Voter.campaign_id == current_user.campaign_id,
        Voter.added_by == current_user.id,
        Voter.deleted_at.is_(None),
        Voter.current_status.not_in(['declined','wrong_number','unreachable']),
    ).order_by(priority_case, Voter.created_at.asc()).limit(50).all()
    return [_voter_out(v) for v in q]


@router.get("/voters/duplicates")
async def get_duplicates(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_coordinator),
):
    q = db.query(Voter).filter(
        Voter.campaign_id == current_user.campaign_id,
        Voter.is_duplicate_flag == True,
        Voter.deleted_at.is_(None),
    )
    if current_user.role == UserRole.coordinator:
        q = q.filter(Voter.zone_id == current_user.zone_id)
    return [_voter_out(v) for v in q.order_by(Voter.created_at.desc()).all()]


@router.get("/voters")
async def list_voters(
    status: str = None,
    pvc_status: str = None,
    support_level: str = None,
    search: str = None,
    polling_unit_id: str = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    limit = min(limit, 200)
    q = db.query(Voter).filter(
        Voter.campaign_id == current_user.campaign_id,
        Voter.deleted_at.is_(None),
    )
    # Scope
    if current_user.role == UserRole.agent:
        q = q.filter(Voter.added_by == current_user.id)
    elif current_user.role == UserRole.coordinator:
        q = q.filter(Voter.zone_id == current_user.zone_id)
    # Filters
    if status and status in VALID_STATUSES:
        q = q.filter(Voter.current_status == status)
    if pvc_status and pvc_status in VALID_PVC:
        q = q.filter(Voter.pvc_status == pvc_status)
    if support_level and support_level in VALID_SUPPORT:
        q = q.filter(Voter.support_level == support_level)
    if polling_unit_id:
        q = q.filter(Voter.polling_unit_id == polling_unit_id)
    if search:
        term = f"%{search}%"
        q = q.filter(or_(Voter.name.ilike(term), Voter.phone.ilike(term)))

    total = q.count()
    voters = q.order_by(Voter.created_at.desc()).offset(offset).limit(limit).all()
    return {"total": total, "voters": [_voter_out(v) for v in voters]}


# ─── 4.4  GET /voters/{id} ────────────────────────────────────────────────────

@router.get("/voters/{voter_id}")
async def get_voter(
    voter_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    v = _get_scoped_voter(voter_id, current_user, db)
    contacts = db.query(VoterContact).filter(
        VoterContact.voter_id == voter_id,
    ).order_by(VoterContact.created_at.desc()).all()
    result = _voter_out(v)
    result["contacts"] = [{
        "id": str(c.id), "status_set": c.status_set, "channel": c.channel,
        "outcome_note": c.outcome_note, "agent_id": str(c.agent_id),
        "created_at": c.created_at.isoformat(),
    } for c in contacts]
    return result


# ─── 4.5  PATCH /voters/{id} ─────────────────────────────────────────────────

@router.patch("/voters/{voter_id}")
async def update_voter(
    voter_id: str,
    body: UpdateVoterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    v = _get_scoped_voter(voter_id, current_user, db)
    data = body.model_dump(exclude_unset=True)

    if "pvc_status" in data and data["pvc_status"] and data["pvc_status"] not in VALID_PVC:
        raise HTTPException(400, f"pvc_status must be one of {sorted(VALID_PVC)}.")
    if "support_level" in data and data["support_level"] and data["support_level"] not in VALID_SUPPORT:
        raise HTTPException(400, f"support_level must be one of {sorted(VALID_SUPPORT)}.")
    if "recruitment_source" in data and data["recruitment_source"] and data["recruitment_source"] not in VALID_SOURCES:
        raise HTTPException(400, f"recruitment_source must be one of {sorted(VALID_SOURCES)}.")
    if "age_range" in data and data["age_range"] and data["age_range"] not in VALID_AGE:
        raise HTTPException(400, f"age_range must be one of {sorted(VALID_AGE)}.")
    if "gender" in data and data["gender"] and data["gender"] not in VALID_GENDER:
        raise HTTPException(400, f"gender must be one of {sorted(VALID_GENDER)}.")

    # Audit 3.4: validate the target polling unit exists, belongs to the same
    # campaign, and (for non-directors) the caller's own zone — and keep
    # voter.zone_id in sync with it so zone-scoped queries never diverge.
    if "polling_unit_id" in data and data["polling_unit_id"]:
        pu = db.query(PollingUnit).filter(
            PollingUnit.id == data["polling_unit_id"],
            PollingUnit.campaign_id == current_user.campaign_id,
        ).first()
        if not pu:
            raise HTTPException(404, "Polling unit not found.")
        if current_user.role != UserRole.director:
            assert_zone_access(current_user, str(pu.zone_id))
        v.polling_unit_id = pu.id
        v.zone_id = pu.zone_id
        del data["polling_unit_id"]

    allowed = {"name","pvc_status","support_level","recruitment_source","age_range","gender","notes"}
    for k, val in data.items():
        if k in allowed:
            setattr(v, k, val if val else None)

    log_action(db, current_user, "voter.updated", "voter", voter_id)
    db.commit()
    db.refresh(v)
    return _voter_out(v)


# ─── 4.5b  POST /voters/{id}/reassign — move a voter to another agent ─────────
# Coordinator/director only. A coordinator may reassign only within their own
# zone and only to an agent in that zone. Directors are unrestricted within
# the campaign.

@router.post("/voters/{voter_id}/reassign")
async def reassign_voter(
    voter_id: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_coordinator),
):
    v = _get_scoped_voter(voter_id, current_user, db)   # enforces zone scope for coordinators

    target_agent_id = (body or {}).get("agent_id")
    if not target_agent_id:
        raise HTTPException(400, "agent_id is required.")

    agent = db.query(User).filter(
        User.id == target_agent_id,
        User.campaign_id == current_user.campaign_id,
        User.role == UserRole.agent,
    ).first()
    if not agent:
        raise HTTPException(404, "Target agent not found in this campaign.")

    # Coordinator may only assign to an agent in the voter's zone.
    if current_user.role != UserRole.director:
        assert_zone_access(current_user, str(v.zone_id))
        if str(agent.zone_id) != str(v.zone_id):
            raise HTTPException(403, "Agent is not in this voter's zone.")

    v.added_by = agent.id
    log_action(db, current_user, "voter.reassigned", "voter", voter_id,
               metadata={"to_agent": str(agent.id)})
    db.commit()
    db.refresh(v)
    return _voter_out(v)


# ─── 4.6  DELETE /voters/{id} (soft delete) ───────────────────────────────────

@router.delete("/voters/{voter_id}")
async def delete_voter(
    voter_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    v = _get_scoped_voter(voter_id, current_user, db)
    v.deleted_at = datetime.now(timezone.utc)
    log_action(db, current_user, "voter.deleted", "voter", voter_id)
    db.commit()
    return {"detail": "Voter removed."}


# ─── 4.7  POST /voters/{id}/contacts ─────────────────────────────────────────

@router.post("/voters/{voter_id}/contacts")
async def log_contact(
    voter_id: str,
    body: LogContactRequest,      # H-3: typed schema replaces raw dict
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    v = _get_scoped_voter(voter_id, current_user, db)

    contact = VoterContact(
        voter_id=voter_id,
        agent_id=current_user.id,
        campaign_id=current_user.campaign_id,
        status_set=body.status_set,
        channel=body.channel,
        outcome_note=body.outcome_note or None,
    )
    db.add(contact)
    v.current_status = body.status_set
    log_action(db, current_user, "voter.contact_logged", "voter", voter_id,
               metadata={"status": body.status_set, "channel": body.channel})
    db.commit()
    return {
        "id":           str(contact.id),
        "voter_id":     voter_id,
        "status_set":   body.status_set,
        "channel":      body.channel,
        "outcome_note": contact.outcome_note,
        "created_at":   contact.created_at.isoformat(),
    }


# ─── 4.10 POST /voters/{id}/resolve-duplicate ────────────────────────────────

@router.post("/voters/{voter_id}/resolve-duplicate")
async def resolve_duplicate(
    voter_id: str,
    body: ResolveDuplicateRequest,   # H-3: typed schema replaces raw dict
    db: Session = Depends(get_db),
    current_user: User = Depends(require_coordinator),
):
    v = db.query(Voter).filter(
        Voter.id == voter_id,
        Voter.campaign_id == current_user.campaign_id,
        Voter.is_duplicate_flag == True,
    ).first()
    if not v:
        raise HTTPException(404, "Duplicate voter not found.")
    assert_zone_access(current_user, v.zone_id)

    if body.action == "delete":
        v.deleted_at = datetime.now(timezone.utc)
    else:  # "keep"
        v.is_duplicate_flag = False
        v.duplicate_of      = None

    log_action(db, current_user, f"voter.duplicate_{body.action}", "voter", voter_id)
    db.commit()
    return {"detail": f"Duplicate {body.action} completed."}


# ─── Helper ───────────────────────────────────────────────────────────────────

def _get_scoped_voter(voter_id: str, user: User, db: Session) -> Voter:
    v = db.query(Voter).filter(
        Voter.id == voter_id,
        Voter.campaign_id == user.campaign_id,
        Voter.deleted_at.is_(None),
    ).first()
    if not v:
        raise HTTPException(404, "Voter not found.")
    if user.role == UserRole.agent and str(v.added_by) != str(user.id):
        raise HTTPException(403, "You can only access voters you added.")
    if user.role == UserRole.coordinator and str(v.zone_id) != str(user.zone_id):
        raise HTTPException(403, "Zone access denied.")
    return v
