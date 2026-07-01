"""Phase 2 — Polling Units router"""
import csv, io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import PollingUnit, Zone, Voter, User
from ..schemas import CreatePURequest, UpdatePURequest
from ..dependencies import require_director, require_coordinator, log_action, assert_zone_access

router = APIRouter(tags=["polling_units"])


def _pu_out(p: PollingUnit, voter_count=0) -> dict:
    return {
        "id": str(p.id), "zone_id": str(p.zone_id),
        "campaign_id": str(p.campaign_id), "name": p.name,
        "inec_code": p.inec_code, "registered_voters": p.registered_voters,
        "voter_count": voter_count, "created_at": p.created_at.isoformat(),
    }


@router.get("/polling-units/template")
async def download_template(current_user: User = Depends(require_director)):
    content = "polling_unit_name,inec_code,zone_name,registered_voters\n"
    content += "Oke-Ado PU 001,OS/IB/01/01/001,Ibadan North,1247\n"
    content += "Sango PU 002,,Ibadan South,\n"
    return StreamingResponse(
        iter([content]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=polling_units_template.csv"},
    )


@router.post("/polling-units")
async def create_pu(
    body: CreatePURequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    zone = db.query(Zone).filter(
        Zone.id == body.zone_id,
        Zone.campaign_id == current_user.campaign_id,
    ).first()
    if not zone:
        raise HTTPException(404, "Zone not found.")

    if body.inec_code:
        clash = db.query(PollingUnit).filter(
            PollingUnit.campaign_id == current_user.campaign_id,
            PollingUnit.inec_code == body.inec_code,
        ).first()
        if clash:
            raise HTTPException(409, f"INEC code '{body.inec_code}' already exists.")

    name_clash = db.query(PollingUnit).filter(
        PollingUnit.zone_id == body.zone_id,
        PollingUnit.name == body.name,
    ).first()
    if name_clash:
        raise HTTPException(409, f"Polling unit '{body.name}' already exists in this zone.")

    pu = PollingUnit(
        zone_id=body.zone_id,
        campaign_id=current_user.campaign_id,
        name=body.name,
        inec_code=body.inec_code,
        registered_voters=body.registered_voters,
    )
    db.add(pu)
    log_action(db, current_user, "polling_unit.created", "polling_unit", None)
    db.commit()
    db.refresh(pu)
    return _pu_out(pu)


MAX_CSV_BYTES = 5 * 1024 * 1024  # 5 MB — generous for a 5000-row CSV (audit 3.5)


@router.post("/polling-units/import")
async def import_pus(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    content = await file.read(MAX_CSV_BYTES + 1)
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(413, f"File too large. Maximum size is {MAX_CSV_BYTES // (1024*1024)} MB.")
    try:
        text = content.decode("utf-8-sig")
    except Exception:
        raise HTTPException(400, "File must be UTF-8 encoded CSV.")

    reader = csv.DictReader(io.StringIO(text))
    required = {"polling_unit_name", "zone_name"}
    if not reader.fieldnames or not required.issubset({f.strip().lower() for f in reader.fieldnames}):
        raise HTTPException(400, f"CSV must have columns: polling_unit_name, zone_name (optional: inec_code, registered_voters)")

    # Normalise column names
    rows = []
    for row in reader:
        rows.append({k.strip().lower(): (v.strip() if v else "") for k, v in row.items()})

    if not rows:
        raise HTTPException(400, "CSV is empty.")
    if len(rows) > 1000:
        raise HTTPException(400, "Maximum 1000 rows per import.")

    # Pre-load zones for this campaign
    zones = {z.name.lower(): z for z in
             db.query(Zone).filter(Zone.campaign_id == current_user.campaign_id).all()}

    # Validate ALL rows first
    errors = []
    for i, row in enumerate(rows, start=2):
        zone_name = row.get("zone_name", "")
        pu_name   = row.get("polling_unit_name", "")
        if not pu_name:
            errors.append({"row": i, "error": "polling_unit_name is required."})
            continue
        if not zone_name or zone_name.lower() not in zones:
            errors.append({"row": i, "error": f"Zone '{zone_name}' not found."})

    if errors:
        return {"success": False, "errors": errors, "imported": 0}

    # Commit all
    imported, skipped = 0, 0
    for i, row in enumerate(rows, start=2):
        zone    = zones[row["zone_name"].lower()]
        pu_name = row["polling_unit_name"]
        inec    = row.get("inec_code") or None
        reg_v   = row.get("registered_voters") or None
        try:
            reg_v = int(reg_v) if reg_v else None
        except ValueError:
            reg_v = None

        exists = db.query(PollingUnit).filter(
            PollingUnit.zone_id == zone.id,
            PollingUnit.name == pu_name,
        ).first()
        if exists:
            skipped += 1
            continue

        pu = PollingUnit(
            zone_id=zone.id,
            campaign_id=current_user.campaign_id,
            name=pu_name,
            inec_code=inec,
            registered_voters=reg_v,
        )
        db.add(pu)
        imported += 1

    log_action(db, current_user, "polling_unit.bulk_import", metadata={"count": imported})
    db.commit()
    return {"success": True, "imported": imported, "skipped": skipped, "errors": []}


@router.get("/polling-units")
async def list_pus(
    zone_id: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_coordinator),
):
    q = db.query(PollingUnit).filter(PollingUnit.campaign_id == current_user.campaign_id)
    if zone_id:
        assert_zone_access(current_user, zone_id)
        q = q.filter(PollingUnit.zone_id == zone_id)
    elif current_user.role == "coordinator":
        q = q.filter(PollingUnit.zone_id == current_user.zone_id)
    pus = q.order_by(PollingUnit.name).all()
    return [_pu_out(p) for p in pus]


@router.patch("/polling-units/{pu_id}")
async def update_pu(
    pu_id: str,
    body: UpdatePURequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    pu = db.query(PollingUnit).filter(
        PollingUnit.id == pu_id,
        PollingUnit.campaign_id == current_user.campaign_id,
    ).first()
    if not pu:
        raise HTTPException(404, "Polling unit not found.")

    data = body.model_dump(exclude_unset=True)
    for k in ("name", "inec_code", "registered_voters"):
        if k in data:
            setattr(pu, k, data[k])

    db.commit()
    db.refresh(pu)
    return _pu_out(pu)


@router.delete("/polling-units/{pu_id}")
async def delete_pu(
    pu_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_director),
):
    pu = db.query(PollingUnit).filter(
        PollingUnit.id == pu_id,
        PollingUnit.campaign_id == current_user.campaign_id,
    ).first()
    if not pu:
        raise HTTPException(404, "Polling unit not found.")

    voters = db.query(func.count(Voter.id)).filter(
        Voter.polling_unit_id == pu_id,
        Voter.deleted_at.is_(None),
    ).scalar()
    if voters > 0:
        raise HTTPException(409, f"Polling unit has {voters} voter(s). Reassign before deleting.")

    db.delete(pu)
    log_action(db, current_user, "polling_unit.deleted", "polling_unit", pu_id)
    db.commit()
    return {"detail": "Polling unit deleted."}
