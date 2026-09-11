"""Annual Competition -- Certificate Generator (Package 8, certificate half).

REQUIREMENTS.md item 5 ("results/certificate visibility") flagged
certificate fields as unanswered and Package 8's own doc scoped both the
leaderboard and the certificate as "wait on client confirmation." Shailesh
(2026-09-05) gave the actual product decisions directly rather than
waiting on a further round-trip to the client:

  - Certificate fields: student name, competition level, rank, score, and
    the competition date, plus MathPath branding -- a single "certificate
    of achievement" design, not two tiers.
  - Eligibility: every student who finalized an attempt gets a
    downloadable certificate once their level's results are released --
    not just rank-holders.
  - Leaderboard scope (the OTHER half of item 5/Package 8): a student sees
    their own result only, once released -- exactly what
    `GetCompetitionEventResultForStudent` (Package 6) already returns.
    Nothing new was needed on the student side for that; see
    `pkg-08-certificates-leaderboard.md` for the full note. The admin-side
    "leaderboard" is `ListCompetitionEventResultsForAdmin` (Package 6),
    already ranked and always visible to admin regardless of release --
    this module does not duplicate that endpoint.

## Gating

A certificate is only ever a rendering of an already-computed, already-
released `CompetitionEventResult` -- this module never computes scores or
ranks itself (that stays `annual_competition_scoring_service.py`'s job,
per that module's own "single funnel" reasoning). The student-facing entry
point re-checks `is_released` on every call rather than trusting anything
cached client-side, the same "never trust a stale flag" discipline every
other Annual Competition module in this epic already follows. Admin can
always download any certificate regardless of release (matches "admin
always sees everything" -- Package 6/7's own convention) -- useful for a
support case or a physical prize-distribution printout before the public
release moment.

## Why this module duplicates a few small helpers instead of importing them

`report_export_service.py` already has a MathPath-branded PDF toolkit
(font registration, logo lookup, a brand color palette) built for the
Parent Progress Report. This module deliberately does NOT import its
underscore-prefixed internals (`_FindMathPathLogo`, `_MpPanel`, etc.) --
those are that module's own private helpers, not a shared library, and
this epic's own established precedent (see e.g.
annual_competition_attempt_service.py's `_NowUtc`/`_Aware`) is for each
service module to stay self-contained with its own tiny copies rather
than reach into another module's internals. The font-registration search
paths and logo candidate paths are copied verbatim from that module so
the certificate matches the rest of MathPath's generated documents, but
this module owns its own copy.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as PdfCanvas
from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    CompetitionEvent,
    CompetitionEventAttempt,
    CompetitionEventResult,
    Student,
)

PDF_MIME = "application/pdf"

# Brand palette -- a small subset of report_export_service.py's own MpXxx
# constants, copied (not imported) per the module docstring above.
CertPage = colors.white
CertInk = colors.HexColor("#0A1633")
CertMuted = colors.HexColor("#69789A")
CertLine = colors.HexColor("#DCE6F5")
CertBlue = colors.HexColor("#2563EB")
CertBlueDark = colors.HexColor("#1D4ED8")
CertGold = colors.HexColor("#B45309")
CertGoldFill = colors.HexColor("#F59E0B")

CertFontRegular = "Helvetica"
CertFontBold = "Helvetica-Bold"


def _RegisterCertFonts() -> None:
    """Same candidate system-font search as report_export_service.py's own
    _RegisterMpFonts -- duplicated, not imported, see module docstring."""
    global CertFontRegular, CertFontBold
    CandidatePairs = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"),
        ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
        ("C:/Windows/Fonts/calibri.ttf", "C:/Windows/Fonts/calibrib.ttf"),
    ]
    for RegularPath, BoldPath in CandidatePairs:
        try:
            if Path(RegularPath).exists() and Path(BoldPath).exists():
                pdfmetrics.registerFont(TTFont("MathPathCertificate-Regular", RegularPath))
                pdfmetrics.registerFont(TTFont("MathPathCertificate-Bold", BoldPath))
                CertFontRegular = "MathPathCertificate-Regular"
                CertFontBold = "MathPathCertificate-Bold"
                return
        except Exception:
            continue


_RegisterCertFonts()


def _FindMathPathLogo() -> str | None:
    """Same candidate-path search as report_export_service.py's own
    _FindMathPathLogo -- duplicated, see module docstring. Missing on disk
    in most environments (this repo's own logo asset is optional), so
    every caller must tolerate None -- the certificate still renders
    correctly without it (see _DrawLogo)."""
    CurrentFile = Path(__file__).resolve()
    CandidatePaths = []
    for Parent in CurrentFile.parents:
        CandidatePaths.extend([
            Parent / "frontend" / "public" / "mathpath-logo.png",
            Parent / "public" / "mathpath-logo.png",
        ])
    for Candidate in CandidatePaths:
        if Candidate.exists() and Candidate.is_file():
            return str(Candidate)
    return None


def _PdfText(Value: Any) -> str:
    Text = str(Value if Value is not None else "")
    return Text.replace("\u2014", "-").replace("\u2013", "-").replace("\u2019", "'")


def _SafeFileNamePart(Value: str | None) -> str:
    Cleaned = re.sub(r"[^A-Za-z0-9]+", "-", (Value or "Student")).strip("-")
    return Cleaned or "Student"


def _FormatNumber(Value: float | int | None) -> str:
    Numeric = float(Value or 0)
    if Numeric == int(Numeric):
        return str(int(Numeric))
    return f"{Numeric:.1f}"


def _StudentDisplayName(StudentRecord: Student | None) -> str:
    if StudentRecord and StudentRecord.user and StudentRecord.user.full_name:
        return StudentRecord.user.full_name
    return StudentRecord.student_code if StudentRecord else "Student"


def _ResolveCertificateData(
    db: Session, AttemptId: str
) -> tuple[CompetitionEventAttempt, CompetitionEventResult, CompetitionEvent | None, Student | None]:
    """Shared lookup for both the student and admin entry points. A
    certificate can only ever exist once a result has been computed
    (FINALIZED), so an attempt with no CompetitionEventResult row yet --
    still in progress, or simply never attempted -- is reported as 404
    "not found" rather than a separate "not ready" state, matching how
    every other not-yet-existing-row case in this epic is reported."""
    AttemptRecord = db.get(CompetitionEventAttempt, AttemptId)
    if not AttemptRecord:
        api_error(404, "COMPETITION_ATTEMPT_NOT_FOUND", "Competition attempt not found.")

    ResultRecord = db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id == AttemptRecord.id).first()
    if not ResultRecord:
        api_error(404, "COMPETITION_RESULT_NOT_FOUND", "No result has been computed for this attempt yet.")

    # Package 10 (go-live rollback plan): a voided result (see
    # VoidCompetitionEventResult in annual_competition_scoring_service.py)
    # is blocked here for BOTH the student and admin entry points, unlike
    # the release gate below which only ever applies to students -- the
    # whole point of voiding is "this result is wrong," so nobody should be
    # able to generate a certificate from it, including an admin's own
    # inspection/print copy that could end up physically handed out.
    if ResultRecord.is_voided:
        api_error(
            409,
            "COMPETITION_RESULT_VOIDED",
            "This result has been voided by an administrator and no certificate is available for it.",
        )

    # 2026-09-11 (Shailesh, Competition Practice feature, Phase B): a
    # practice attempt's result is set is_released=True at creation (see
    # ComputeAndFinalizeCompetitionEventResult's practice branch) so the
    # student can see their own score immediately -- but that would let a
    # student's is_released check below pass for a practice paper too, and a
    # "Certificate of Achievement" is explicitly an OFFICIAL-competition
    # artifact (module docstring: "every student who finalized an [official]
    # attempt"). Blocked here, in the one shared resolver both the student
    # and admin entry points funnel through, rather than duplicated in each.
    if AttemptRecord.attempt_type == "PRACTICE":
        api_error(
            409,
            "COMPETITION_CERTIFICATE_NOT_AVAILABLE_FOR_PRACTICE",
            "Certificates are only issued for the official Annual Competition, not practice attempts.",
        )

    EventRecord = db.get(CompetitionEvent, AttemptRecord.event_id)
    StudentRecord = db.get(Student, AttemptRecord.student_id)
    return AttemptRecord, ResultRecord, EventRecord, StudentRecord


def _DrawLogo(Pdf: PdfCanvas.Canvas, CenterX: float, TopY: float) -> None:
    LogoPath = _FindMathPathLogo()
    if not LogoPath:
        return
    LogoW, LogoH = 32 * mm, 14 * mm
    try:
        Pdf.drawImage(LogoPath, CenterX - LogoW / 2, TopY - LogoH, LogoW, LogoH, preserveAspectRatio=True, mask="auto", anchor="c")
    except Exception:
        pass


def _RenderCertificatePdf(ResultRecord: CompetitionEventResult, EventRecord: CompetitionEvent | None, StudentRecord: Student | None) -> StreamingResponse:
    Buffer = BytesIO()
    PageSize = landscape(A4)
    Width, Height = PageSize
    Pdf = PdfCanvas.Canvas(Buffer, pagesize=PageSize)
    CenterX = Width / 2

    Pdf.setFillColor(CertPage)
    Pdf.rect(0, 0, Width, Height, fill=1, stroke=0)

    # Decorative double border -- outer blue, inner gold -- gives the
    # certificate its "award" framing without needing any image asset.
    Margin = 10 * mm
    Pdf.setStrokeColor(CertBlue)
    Pdf.setLineWidth(2.2)
    Pdf.roundRect(Margin, Margin, Width - 2 * Margin, Height - 2 * Margin, 6 * mm, fill=0, stroke=1)
    InnerMargin = Margin + 3.2 * mm
    Pdf.setStrokeColor(CertGoldFill)
    Pdf.setLineWidth(0.9)
    Pdf.roundRect(InnerMargin, InnerMargin, Width - 2 * InnerMargin, Height - 2 * InnerMargin, 5 * mm, fill=0, stroke=1)

    _DrawLogo(Pdf, CenterX, Height - 20 * mm)

    Pdf.setFillColor(CertBlueDark)
    Pdf.setFont(CertFontBold, 30)
    Pdf.drawCentredString(CenterX, Height - 52 * mm, "CERTIFICATE OF ACHIEVEMENT")

    Pdf.setFillColor(CertMuted)
    Pdf.setFont(CertFontRegular, 11)
    Pdf.drawCentredString(CenterX, Height - 60 * mm, "MathPath Annual Competition")

    Pdf.setFillColor(CertInk)
    Pdf.setFont(CertFontRegular, 12)
    Pdf.drawCentredString(CenterX, Height - 76 * mm, "This is to certify that")

    StudentName = _PdfText(_StudentDisplayName(StudentRecord))
    Pdf.setFillColor(CertBlueDark)
    Pdf.setFont(CertFontBold, 26)
    Pdf.drawCentredString(CenterX, Height - 90 * mm, StudentName)

    NameWidth = Pdf.stringWidth(StudentName, CertFontBold, 26)
    Pdf.setStrokeColor(CertGoldFill)
    Pdf.setLineWidth(1.1)
    Pdf.line(CenterX - NameWidth / 2 - 6 * mm, Height - 93 * mm, CenterX + NameWidth / 2 + 6 * mm, Height - 93 * mm)

    LevelLabel = _PdfText(ResultRecord.competition_level_code)
    ScoreText = f"{_FormatNumber(ResultRecord.score)}/{_FormatNumber(ResultRecord.max_score)} ({_FormatNumber(ResultRecord.percentage)}%)"
    RankText = f"Rank {ResultRecord.rank}" if ResultRecord.rank else "a completed attempt"
    CompetitionDateText = (
        EventRecord.competition_date.strftime("%d %B %Y") if EventRecord and EventRecord.competition_date else None
    )

    Pdf.setFillColor(CertInk)
    Pdf.setFont(CertFontRegular, 12.5)
    Pdf.drawCentredString(CenterX, Height - 104 * mm, f"has participated in the MathPath Annual Competition ({LevelLabel} level)")
    Pdf.drawCentredString(CenterX, Height - 112 * mm, f"and secured {RankText} with a score of {ScoreText}")

    if CompetitionDateText:
        Pdf.setFillColor(CertMuted)
        Pdf.setFont(CertFontRegular, 10.5)
        Pdf.drawCentredString(CenterX, Height - 122 * mm, f"held on {CompetitionDateText}")

    # Footer: two signature lines (program director / date of issue) --
    # no signature image asset exists in this repo, so these are printed
    # placeholders, not a blocker for issuing the certificate itself.
    FooterY = Margin + 16 * mm
    SignatureLineWidth = 55 * mm
    LeftSignX = Margin + 20 * mm
    RightSignX = Width - Margin - 20 * mm - SignatureLineWidth
    Pdf.setStrokeColor(CertLine)
    Pdf.setLineWidth(0.8)
    for SignX in (LeftSignX, RightSignX):
        Pdf.line(SignX, FooterY, SignX + SignatureLineWidth, FooterY)
    Pdf.setFillColor(CertMuted)
    Pdf.setFont(CertFontRegular, 8.5)
    Pdf.drawCentredString(LeftSignX + SignatureLineWidth / 2, FooterY - 5 * mm, "Program Director")
    Pdf.drawCentredString(RightSignX + SignatureLineWidth / 2, FooterY - 5 * mm, "Date of Issue")
    Pdf.setFillColor(CertInk)
    Pdf.setFont(CertFontRegular, 9)
    Pdf.drawCentredString(RightSignX + SignatureLineWidth / 2, FooterY + 1.5 * mm, datetime.now(timezone.utc).strftime("%d %b %Y"))

    Pdf.save()
    Buffer.seek(0)

    FileName = f"MathPath-Annual-Competition-Certificate-{_SafeFileNamePart(_StudentDisplayName(StudentRecord))}.pdf"
    return StreamingResponse(
        Buffer,
        media_type=PDF_MIME,
        headers={"Content-Disposition": f'attachment; filename="{FileName}"'},
    )


def BuildAnnualCompetitionCertificateForStudent(db: Session, StudentRecord: Student, AttemptId: str) -> StreamingResponse:
    """Student-facing download. Ownership-checked against the attempt (not
    just the result) so a student can never probe another student's
    attempt id to learn whether/how they scored, even indirectly via a
    404-vs-403 timing/response difference -- an attempt that isn't theirs
    is reported exactly like one that doesn't exist at all."""
    AttemptRecord, ResultRecord, EventRecord, OwnerStudent = _ResolveCertificateData(db, AttemptId)
    if AttemptRecord.student_id != StudentRecord.id:
        api_error(404, "COMPETITION_ATTEMPT_NOT_FOUND", "Competition attempt not found.")

    if not ResultRecord.is_released:
        api_error(
            403,
            "COMPETITION_RESULT_NOT_RELEASED",
            "Your certificate will be available once this level's results are released.",
        )

    return _RenderCertificatePdf(ResultRecord, EventRecord, OwnerStudent)


def BuildAnnualCompetitionCertificateForAdmin(db: Session, *, AttemptId: str) -> StreamingResponse:
    """Admin-only download -- bypasses the release gate entirely, matching
    this epic's established "admin always sees everything" convention
    (Package 6's ListCompetitionEventResultsForAdmin, Package 7's live
    monitoring). Useful for a support case, a QA check, or printing
    physical certificates ahead of the public release moment."""
    _, ResultRecord, EventRecord, StudentRecord = _ResolveCertificateData(db, AttemptId)
    return _RenderCertificatePdf(ResultRecord, EventRecord, StudentRecord)
