"""Demo seed (design §14): DPDP-safe synthetic patients + curated
interactions. Idempotent per-patient. Passwords are the demo
creds; disable/rotate in prod.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .auth import hash_password
from .dosage import parse_dosage
from .models import CaregiverLink, Interaction, Medicine, Patient, ReminderLog, Report

DEMO_PASSWORD = "pass1234"

# (salt_a, salt_b, severity, note, source) — normalized on insert.
_INTERACTIONS = [
    ("Ibuprofen", "Aspirin", "major",
     "NSAID (ibuprofen) can blunt aspirin's cardio-protective effect and raises "
     "GI bleeding risk when combined.",
     "FDA Drug Safety Communication, 2006 (ibuprofen-aspirin interaction)"),
    ("Levothyroxine", "Pantoprazole", "moderate",
     "PPIs (pantoprazole) can reduce levothyroxine absorption; separate dosing "
     "and monitor thyroid levels.",
     "Br J Clin Pharmacol, PPI-levothyroxine absorption studies"),
    ("Metformin", "Ibuprofen", "moderate",
     "NSAIDs may impair renal function and increase metformin/lactic-acidosis "
     "risk in susceptible patients.",
     "Micromedex NSAID-metformin renal caution"),
]


def _med(report: Report, patient_id: str, brand: str, salt: str, strength: str,
         notation: str, duration: int | None, doctor: str) -> Medicine:
    d = parse_dosage(notation)
    return Medicine(
        patient_id=patient_id, brand=brand, salt=salt, strength=strength,
        form="tablet", dosage_notation=notation, timing=d.timings,
        per_day=d.per_day, prn=d.prn, duration_days=duration,
        start_date=date.today().isoformat(), status="active", confidence=1.0,
        needs_salt_confirmation=False, prescriber_name=doctor,
    )


def _report(db: Session, patient_id: str, doctor: str, specialty: str,
            follow_up_in: int | None = None) -> Report:
    follow = (date.today() + timedelta(days=follow_up_in)).isoformat() if follow_up_in else None
    r = Report(patient_id=patient_id, prescriber_name=doctor,
               prescriber_specialty=specialty, confirmed=True, ocr_confidence=1.0,
               filename="seed.jpg", raw_ocr="[seeded]", parsed_json={},
               follow_up_date=follow)
    db.add(r)
    return r


def seed(db: Session) -> None:
    """Idempotent per-patient: base demo set (Aarav + Shanti), then Ramesh
    (single-doctor free patient matching the demo handwritten prescription),
    then the caregiver family (Sunita + Meera with consented links)."""
    seed_interactions(db)
    pw = hash_password(DEMO_PASSWORD)
    if not db.get(Patient, "shanti"):
        _seed_base(db, pw)
    if not db.get(Patient, "ramesh"):
        _seed_ramesh(db, pw)
    if not db.get(Patient, "meera"):
        _seed_caregiver(db, pw)
    _seed_ramesh_caregiver_demo(db, pw)


def seed_interactions(db: Session) -> None:
    """Install the small cited rule set independently from synthetic demos."""
    existing = {
        tuple(sorted(((row.salt_a or "").strip().lower(), (row.salt_b or "").strip().lower())))
        for row in db.query(Interaction).all()
    }
    added = False
    for salt_a, salt_b, severity, note, source in _INTERACTIONS:
        pair = tuple(sorted((salt_a.strip().lower(), salt_b.strip().lower())))
        if pair in existing:
            continue
        db.add(Interaction(
            salt_a=pair[0],
            salt_b=pair[1],
            severity=severity,
            note=note,
            source=source,
        ))
        existing.add(pair)
        added = True
    if added:
        db.commit()


def _seed_base(db: Session, pw: str) -> None:
    db.add(Patient(id="aarav", name="Aarav Sharma", email="aarav@demo.in",
                   phone="+919000000001", password_hash=pw, plan="free"))
    db.add(Patient(id="shanti", name="Shanti Devi", email="shanti@demo.in",
                   phone="+919000000002", password_hash=pw, plan="pro"))

    # Aarav (free): one prescription, review in a week.
    r = _report(db, "aarav", "Dr. Verma", "General Physician", follow_up_in=7)
    r.medicines.append(_med(r, "aarav", "Pan 40", "Pantoprazole", "40mg", "1-0-0", 14, "Dr. Verma"))
    r.medicines.append(_med(r, "aarav", "Digene", "Antacid (Magnesium/Aluminium hydroxide)", "", "SOS", None, "Dr. Verma"))

    # Shanti (pro): three prescriptions - the interaction-check demo. Cardio review in 2 weeks.
    r1 = _report(db, "shanti", "Dr. Mehta", "Cardiology", follow_up_in=14)
    r1.medicines.append(_med(r1, "shanti", "Ecosprin 75", "Aspirin", "75mg", "0-1-0", None, "Dr. Mehta"))
    r1.medicines.append(_med(r1, "shanti", "Amlong 5", "Amlodipine", "5mg", "1-0-0", None, "Dr. Mehta"))

    r2 = _report(db, "shanti", "Dr. Singh", "Physician")
    r2.medicines.append(_med(r2, "shanti", "Glycomet 500", "Metformin", "500mg", "1-0-1", None, "Dr. Singh"))
    r2.medicines.append(_med(r2, "shanti", "Thyronorm 50", "Levothyroxine", "50mcg", "1-0-0", None, "Dr. Singh"))

    r3 = _report(db, "shanti", "Dr. Rao", "Orthopaedics")
    r3.medicines.append(_med(r3, "shanti", "Brufen 400", "Ibuprofen", "400mg", "1-0-1", 5, "Dr. Rao"))

    _reminders(db, (("aarav", 3), ("shanti", 6)))
    db.commit()


def _seed_ramesh(db: Session, pw: str) -> None:
    # Free patient, single doctor - matches the demo handwritten prescription
    # (Dr. Anjali Deshmukh, City Care Polyclinic: Hypertension + Type 2 Diabetes,
    # image dated 24/09/2026, review after ~1 month). No interacting salts.
    db.add(Patient(id="ramesh", name="Ramesh Kulkarni", email="ramesh@demo.in",
                   phone="+919454535137", password_hash=pw, plan="free"))
    doc = "Dr. Anjali Deshmukh"
    rr = _report(db, "ramesh", doc, "General Medicine", follow_up_in=28)
    rr.medicines.append(_med(rr, "ramesh", "Amlong 5", "Amlodipine", "5mg", "1-0-0", 30, doc))
    rr.medicines.append(_med(rr, "ramesh", "Glycomet 500", "Metformin", "500mg", "1-0-1", 30, doc))
    rr.medicines.append(_med(rr, "ramesh", "Ecosprin 75", "Aspirin", "75mg", "0-0-1", 30, doc))
    rr.medicines.append(_med(rr, "ramesh", "Pan 40", "Pantoprazole", "40mg", "1-0-0", 15, doc))
    _reminders(db, (("ramesh", 4),))
    db.commit()


def _seed_caregiver(db: Session, pw: str) -> None:
    """Caregiver demo (design: caregiver.md): Meera (Ramesh's daughter, Bengaluru)
    manages four family members — Ramesh, Shanti, Aarav, Sunita — through
    consented links. Sunita is seeded here (thyroid) so the family card grid
    shows four patients; the other three reuse the existing rich demo data."""
    db.add(Patient(id="sunita", name="Sunita Kulkarni", email="sunita@demo.in",
                   phone="+919454535135", password_hash=pw, plan="free"))
    doc = "Dr. Kavita Rao"
    rs = _report(db, "sunita", doc, "Endocrinology", follow_up_in=10)
    rs.medicines.append(_med(rs, "sunita", "Thyronorm 50", "Levothyroxine", "50mcg", "1-0-0", None, doc))
    _reminders(db, (("sunita", 2),))

    db.add(Patient(id="meera", name="Meera Kulkarni", email="meera@demo.in",
                   phone="+919454535136", password_hash=pw, plan="pro", role="caregiver"))
    for pid, relation in (("ramesh", "father"), ("shanti", "grandmother"),
                          ("aarav", "brother"), ("sunita", "mother")):
        db.add(CaregiverLink(caregiver_id="meera", patient_id=pid, relation=relation))
    db.commit()


def _seed_ramesh_caregiver_demo(db: Session, pw: str) -> None:
    """Seed the requested Ramesh-caregiver / Ram-patient demo pair idempotently."""
    if not db.get(Patient, "ram"):
        db.add(Patient(
            id="ram", name="Ram Sharma", email="ram@demo.in",
            phone="+919454535138", password_hash=pw, plan="free", role="patient",
        ))
        report = _report(db, "ram", "Dr. N. Patel", "Family Medicine", follow_up_in=21)
        report.medicines.append(
            _med(report, "ram", "Amlong 5", "Amlodipine", "5mg", "1-0-0", 30, "Dr. N. Patel")
        )
        _reminders(db, (("ram", 2),))

    caregiver_id = "ramesh-caregiver"
    if not db.get(Patient, caregiver_id):
        db.add(Patient(
            id=caregiver_id, name="Ramesh Kulkarni (Caregiver)",
            email="ramesh.caregiver@demo.in", phone="+919454535139",
            password_hash=pw, plan="free", role="caregiver",
        ))

    link = db.query(CaregiverLink).filter(
        CaregiverLink.caregiver_id == caregiver_id,
        CaregiverLink.patient_id == "ram",
    ).first()
    if not link:
        db.add(CaregiverLink(caregiver_id=caregiver_id, patient_id="ram", relation="father"))
    db.commit()


def _reminders(db: Session, spec) -> None:
    # Stubbed WhatsApp dose nudges over the last few days (design: "kitne messages gaye").
    now = datetime.now(timezone.utc)
    for pid, n in spec:
        for k in range(n):
            db.add(ReminderLog(
                patient_id=pid, channel="whatsapp", kind="dose",
                body="Good morning! Time for your morning medicines.",
                status="sent", sent_at=now - timedelta(days=k),
            ))
