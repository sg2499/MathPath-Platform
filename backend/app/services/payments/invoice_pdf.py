"""Tax invoice PDF (Payments Phase 2, 2026-10-08).

The same content as the old platform's TAX INVOICE: business block, the
student's centre (or every centre when the student has none), Bill To, the
line with its taxable amount and CGST/SGST split, totals, amount paid and
balance, amount in words, authorised signatory and the computer-generated
footer. Everything printed comes from the invoice's own snapshot, so a
reprint months later shows exactly what was issued.

One invoice per A4 page; a bulk PDF is the same pages one after another.
A cancelled invoice is printed with a CANCELLED stamp across it.

Fonts: DejaVu Sans when the server has it (it has the rupee sign), else
Helvetica with "Rs." instead of the rupee sign.
"""
from __future__ import annotations

import calendar
import json
import re
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Flowable, Frame, Image, KeepTogether, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle
from xml.sax.saxutils import escape

from app.models import PaymentInvoice
from app.services.payments.money import FormatIndianRupees

FontRegular = "Helvetica"
FontBold = "Helvetica-Bold"
HasRupeeGlyph = False

INK = colors.HexColor("#1f2433")
MUTED = colors.HexColor("#5d6478")
RULE = colors.HexColor("#d7dbe6")
BRAND = colors.HexColor("#4338ca")
WASH = colors.HexColor("#f3f4fa")
STATUS_COLOURS = {
    "PENDING": colors.HexColor("#b45309"),
    "PART_PAID": colors.HexColor("#1d4ed8"),
    "PAID": colors.HexColor("#047857"),
    "CANCELLED": colors.HexColor("#b91c1c"),
}
STATUS_LABELS = {"PENDING": "PENDING", "PART_PAID": "PART-PAID", "PAID": "PAID", "CANCELLED": "CANCELLED"}


def _RegisterInvoiceFonts() -> None:
    global FontRegular, FontBold, HasRupeeGlyph
    CandidatePairs = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
    ]
    for RegularPath, BoldPath in CandidatePairs:
        try:
            if Path(RegularPath).exists() and Path(BoldPath).exists():
                pdfmetrics.registerFont(TTFont("MathPathInvoice-Regular", RegularPath))
                pdfmetrics.registerFont(TTFont("MathPathInvoice-Bold", BoldPath))
                # So <b> inside a paragraph switches to the bold face.
                pdfmetrics.registerFontFamily(
                    "MathPathInvoice-Regular",
                    normal="MathPathInvoice-Regular",
                    bold="MathPathInvoice-Bold",
                    italic="MathPathInvoice-Regular",
                    boldItalic="MathPathInvoice-Bold",
                )
                FontRegular, FontBold, HasRupeeGlyph = "MathPathInvoice-Regular", "MathPathInvoice-Bold", True
                return
        except Exception:
            continue


_RegisterInvoiceFonts()


def _FindLogo() -> str | None:
    for Parent in Path(__file__).resolve().parents:
        for Candidate in (Parent / "frontend" / "public" / "mathpath-logo.png", Parent / "public" / "mathpath-logo.png"):
            if Candidate.is_file():
                return str(Candidate)
    return None


LOGO_PATH = _FindLogo()


def Money(Paise: int) -> str:
    Text = FormatIndianRupees(Paise)
    return Text if HasRupeeGlyph else Text.replace("₹", "Rs. ")


def _T(Value: Any) -> str:
    """Escaped text for a Paragraph; keeps line breaks."""
    Text = str(Value if Value is not None else "").strip()
    if not HasRupeeGlyph:
        Text = Text.replace("₹", "Rs. ")
    return escape(Text).replace("\n", "<br/>")


# ----------------------------------------------------------------------------
# Amount in words (Indian system: thousand, lakh, crore)
# ----------------------------------------------------------------------------

_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
         "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _BelowHundred(N: int) -> str:
    if N < 20:
        return _ONES[N]
    return (_TENS[N // 10] + (" " + _ONES[N % 10] if N % 10 else "")).strip()


def _BelowThousand(N: int) -> str:
    Hundreds, Rest = divmod(N, 100)
    Parts = []
    if Hundreds:
        Parts.append(f"{_ONES[Hundreds]} Hundred")
    if Rest:
        Parts.append(_BelowHundred(Rest))
    return " ".join(Parts)


def NumberToIndianWords(N: int) -> str:
    N = int(N)
    if N == 0:
        return "Zero"
    Parts = []
    Crore, N = divmod(N, 10_000_000)
    Lakh, N = divmod(N, 100_000)
    Thousand, N = divmod(N, 1000)
    if Crore:
        Parts.append(f"{NumberToIndianWords(Crore)} Crore")
    if Lakh:
        Parts.append(f"{_BelowHundred(Lakh)} Lakh")
    if Thousand:
        Parts.append(f"{_BelowHundred(Thousand)} Thousand")
    if N:
        Parts.append(_BelowThousand(N))
    return " ".join(Parts)


def AmountInWords(Paise: int) -> str:
    Rupees, Fraction = divmod(abs(int(Paise)), 100)
    Text = f"Rupees {NumberToIndianWords(Rupees)}"
    if Fraction:
        Text += f" and {NumberToIndianWords(Fraction)} Paise"
    return Text + " Only"


# ----------------------------------------------------------------------------
# Styles
# ----------------------------------------------------------------------------

def _Styles() -> dict[str, ParagraphStyle]:
    return {
        "brand": ParagraphStyle("brand", fontName=FontBold, fontSize=17, leading=20, textColor=INK),
        "legal": ParagraphStyle("legal", fontName=FontBold, fontSize=9, leading=12, textColor=INK),
        "small": ParagraphStyle("small", fontName=FontRegular, fontSize=8.2, leading=11, textColor=MUTED),
        "body": ParagraphStyle("body", fontName=FontRegular, fontSize=9, leading=12.5, textColor=INK),
        "bodyBold": ParagraphStyle("bodyBold", fontName=FontBold, fontSize=9, leading=12.5, textColor=INK),
        "label": ParagraphStyle("label", fontName=FontBold, fontSize=7.4, leading=10, textColor=MUTED),
        "title": ParagraphStyle("title", fontName=FontBold, fontSize=18, leading=21, textColor=BRAND, alignment=TA_RIGHT),
        "right": ParagraphStyle("right", fontName=FontRegular, fontSize=9, leading=12.5, textColor=INK, alignment=TA_RIGHT),
        "rightBold": ParagraphStyle("rightBold", fontName=FontBold, fontSize=9, leading=12.5, textColor=INK, alignment=TA_RIGHT),
        "cell": ParagraphStyle("cell", fontName=FontRegular, fontSize=8.6, leading=11.5, textColor=INK),
        "cellHead": ParagraphStyle("cellHead", fontName=FontBold, fontSize=7.6, leading=10, textColor=MUTED),
        "cellHeadRight": ParagraphStyle("cellHeadRight", fontName=FontBold, fontSize=7.6, leading=10, textColor=MUTED, alignment=TA_RIGHT),
        "cellRight": ParagraphStyle("cellRight", fontName=FontRegular, fontSize=8.6, leading=11.5, textColor=INK, alignment=TA_RIGHT),
        "foot": ParagraphStyle("foot", fontName=FontRegular, fontSize=7.8, leading=10.5, textColor=MUTED),
    }


class _StatusMark(Flowable):
    """Zero-size marker: tells the page-end hook which invoice (and status)
    this page belongs to, for the CANCELLED stamp and the page footer."""

    def __init__(self, Status: str, Number: str):
        super().__init__()
        self.Status = Status
        self.Number = Number
        self.width = self.height = 0

    def draw(self) -> None:
        self.canv._mpInvoiceStatus = self.Status  # type: ignore[attr-defined]
        self.canv._mpInvoiceNumber = self.Number  # type: ignore[attr-defined]


def _OnPageEnd(Canvas, Doc) -> None:
    Width, Height = A4
    Status = getattr(Canvas, "_mpInvoiceStatus", None)
    if Status == "CANCELLED":
        Canvas.saveState()
        Canvas.setFillColor(STATUS_COLOURS["CANCELLED"])
        try:
            Canvas.setFillAlpha(0.13)
        except Exception:
            pass
        Canvas.setFont(FontBold, 80)
        Canvas.translate(Width / 2, Height / 2)
        Canvas.rotate(35)
        Canvas.drawCentredString(0, -30, "CANCELLED")
        Canvas.restoreState()
    Canvas.saveState()
    Canvas.setFont(FontRegular, 7)
    Canvas.setFillColor(MUTED)
    Number = getattr(Canvas, "_mpInvoiceNumber", "") or ""
    Canvas.drawString(16 * mm, 9 * mm, Number)
    Canvas.drawRightString(Width - 16 * mm, 9 * mm, f"Page {Doc.page}")
    Canvas.restoreState()


# ----------------------------------------------------------------------------
# One invoice
# ----------------------------------------------------------------------------

def _FormatDate(Value) -> str:
    return Value.strftime("%d %b %Y") if Value else "-"


def _BusinessHeader(Business: dict[str, Any], RightBlock: list, S: dict[str, ParagraphStyle], ContentWidth: float) -> list:
    """Business on the left (logo, names, address, contact, GSTIN), the
    document title and number on the right."""
    BrandName = Business.get("brandName") or Business.get("legalName") or "MathPath"
    LeftBlock: list = []
    if LOGO_PATH:
        try:
            Logo = Image(LOGO_PATH)
            Ratio = Logo.imageWidth / float(Logo.imageHeight or 1)
            Logo.drawHeight = 13 * mm
            Logo.drawWidth = min(13 * mm * Ratio, 45 * mm)
            Logo.hAlign = "LEFT"
            LeftBlock.append(Logo)
            LeftBlock.append(Spacer(1, 2 * mm))
        except Exception:
            pass
    LeftBlock.append(Paragraph(_T(BrandName), S["brand"]))
    if Business.get("legalName") and Business.get("legalName") != BrandName:
        LeftBlock.append(Paragraph(_T(Business["legalName"]), S["legal"]))
    if Business.get("registeredAddress"):
        LeftBlock.append(Paragraph(_T(Business["registeredAddress"]), S["small"]))
    Contact = "   ".join(Part for Part in [Business.get("email"), Business.get("phone")] if Part)
    if Contact:
        LeftBlock.append(Paragraph(_T(Contact), S["small"]))
    if Business.get("gstin"):
        LeftBlock.append(Paragraph(f"<b>GSTIN</b> {_T(Business['gstin'])}", S["small"]))
    Header = Table([[LeftBlock, RightBlock]], colWidths=[ContentWidth * 0.6, ContentWidth * 0.4])
    Header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return [Header, Spacer(1, 4 * mm)]


def _CentreBlock(Centre: dict[str, Any], S: dict[str, ParagraphStyle], ContentWidth: float) -> list:
    if Centre.get("name"):
        CentreText = f"<b>Centre:</b> {_T(Centre['name'])}"
        if Centre.get("address"):
            CentreText += f", {_T(Centre['address'])}"
        if Centre.get("phone"):
            CentreText += f"   {_T(Centre['phone'])}"
    else:
        Lines = [f"<b>{_T(Row.get('name'))}:</b> {_T(Row.get('address'))}" for Row in (Centre.get("all") or [])]
        CentreText = ("<b>Centres</b><br/>" + "<br/>".join(Lines)) if Lines else ""
    if not CentreText:
        return []
    CentreTable = Table([[Paragraph(CentreText, S["small"])]], colWidths=[ContentWidth])
    CentreTable.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WASH),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [CentreTable, Spacer(1, 4 * mm)]


def _SignatoryAndFooter(Business: dict[str, Any], DefaultFooter: str, S: dict[str, ParagraphStyle], W: float) -> list:
    BrandName = Business.get("brandName") or Business.get("legalName") or "MathPath"
    Sign = Table(
        [[Paragraph("", S["body"]), Paragraph(f"For <b>{_T(Business.get('legalName') or BrandName)}</b>", S["right"])],
         [Paragraph("", S["body"]), Paragraph("<br/><br/>Authorised Signatory", S["right"])]],
        colWidths=[W * 0.55, W * 0.45],
    )
    Sign.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    Footer = Business.get("footer") or DefaultFooter
    if DefaultFooter.endswith("Money Receipt.") and Business.get("footer"):
        Footer = Footer.replace("Tax Invoice", "Money Receipt")
    return [KeepTogether([Sign, Spacer(1, 6 * mm), Paragraph(_T(Footer), S["foot"])])]


def _InvoiceStory(Invoice: PaymentInvoice, S: dict[str, ParagraphStyle], ContentWidth: float) -> list:
    Snap = json.loads(Invoice.snapshot_json)
    Business = Snap.get("business") or {}
    Centre = Snap.get("centre") or {}
    Student = Snap.get("student") or {}
    Status = Invoice.status
    Story: list = [_StatusMark(Status, Invoice.invoice_number)]

    StatusColour = STATUS_COLOURS.get(Status, MUTED).hexval().replace("0x", "#")
    RightBlock = [
        Paragraph("TAX INVOICE", S["title"]),
        Spacer(1, 2 * mm),
        Paragraph(f"<b>{_T(Invoice.invoice_number)}</b>", S["rightBold"]),
        Paragraph(f"Invoice date: {_FormatDate(Invoice.invoice_date)}", S["right"]),
        Paragraph(f"Due date: {_FormatDate(Invoice.due_date)}", S["right"]),
        Spacer(1, 1.5 * mm),
        Paragraph(f'<font color="{StatusColour}"><b>{STATUS_LABELS.get(Status, Status)}</b></font>', S["rightBold"]),
    ]
    BrandName = Business.get("brandName") or Business.get("legalName") or "MathPath"
    Story += _BusinessHeader(Business, RightBlock, S, ContentWidth)
    Story += _CentreBlock(Centre, S, ContentWidth)

    # Bill To and invoice details.
    BillTo = [Paragraph("BILL TO", S["label"]), Paragraph(f"<b>{_T(Student.get('name'))}</b>", S["body"])]
    if Student.get("parentName"):
        BillTo.append(Paragraph(f"Parent: {_T(Student['parentName'])}", S["body"]))
    if Student.get("address"):
        BillTo.append(Paragraph(_T(Student["address"]), S["body"]))
    for Part in (Student.get("mobile"), Student.get("email")):
        if Part:
            BillTo.append(Paragraph(_T(Part), S["body"]))
    DetailRows = [
        ("Student ID", Student.get("studentCode")),
        ("Old ID", Student.get("customId")),
        ("Level", " ".join(Part for Part in [Student.get("levelCode"), f"({Student['levelName']})" if Student.get("levelName") else None] if Part) or None),
        ("Fee", Invoice.fee_name),
        ("Period", (f"{_MonthName(Invoice.billing_month)} {Invoice.billing_year}" if Invoice.billing_month and Invoice.billing_year else None)),
    ]
    Details = [Paragraph("DETAILS", S["label"])]
    for Label, Value in DetailRows:
        if Value:
            Details.append(Paragraph(f'<font color="#5d6478">{Label}:</font> {_T(Value)}', S["body"]))
    Parties = Table([[BillTo, Details]], colWidths=[ContentWidth * 0.55, ContentWidth * 0.45])
    Parties.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, -1), 0), ("RIGHTPADDING", (-1, 0), (-1, -1), 0),
        ("LINEABOVE", (0, 0), (-1, 0), 0.6, RULE), ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    Story += [Parties, Spacer(1, 5 * mm)]

    # The line.
    Rate = (Invoice.gst_rate_bps or 0) / 100
    Half = f"{Rate / 2:g}%"
    Head = [
        Paragraph("#", S["cellHead"]),
        Paragraph("DESCRIPTION", S["cellHead"]),
        Paragraph("QTY", S["cellHeadRight"]),
        Paragraph("TAXABLE", S["cellHeadRight"]),
        Paragraph(f"CGST {Half}", S["cellHeadRight"]),
        Paragraph(f"SGST {Half}", S["cellHeadRight"]),
        Paragraph("AMOUNT", S["cellHeadRight"]),
    ]
    Line = [
        Paragraph("1", S["cell"]),
        Paragraph(_T(Invoice.description), S["cell"]),
        Paragraph("1", S["cellRight"]),
        Paragraph(Money(Invoice.taxable_paise), S["cellRight"]),
        Paragraph(Money(Invoice.cgst_paise), S["cellRight"]),
        Paragraph(Money(Invoice.sgst_paise), S["cellRight"]),
        Paragraph(f"<b>{Money(Invoice.amount_paise)}</b>", S["cellRight"]),
    ]
    W = ContentWidth
    Lines = Table([Head, Line], colWidths=[W * 0.04, W * 0.39, W * 0.07, W * 0.13, W * 0.11, W * 0.11, W * 0.15], repeatRows=1)
    Lines.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), WASH),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    Story += [Lines, Spacer(1, 4 * mm)]

    # Totals.
    Discount = Invoice.discount_paise or 0
    Balance = 0 if Status == "CANCELLED" else max(0, Invoice.amount_paise - Invoice.paid_paise - Discount)
    TotalRows = [
        ("Taxable amount", Money(Invoice.taxable_paise), False),
        (f"CGST {Half}", Money(Invoice.cgst_paise), False),
        (f"SGST {Half}", Money(Invoice.sgst_paise), False),
        ("Invoice total", Money(Invoice.amount_paise), True),
        ("Amount paid", Money(Invoice.paid_paise), False),
    ]
    if Discount:
        TotalRows.append(("Discount", Money(Discount), False))
    TotalRows.append(("Balance due", Money(Balance), True))
    LastRow = len(TotalRows) - 1
    TotalsData = [[Paragraph(Label, S["rightBold"] if Bold else S["right"]), Paragraph(Value, S["rightBold"] if Bold else S["right"])] for Label, Value, Bold in TotalRows]
    Totals = Table(TotalsData, colWidths=[W * 0.22, W * 0.18])
    Totals.setStyle(TableStyle([
        ("LINEABOVE", (0, 3), (-1, 3), 0.6, RULE),
        ("LINEABOVE", (0, LastRow), (-1, LastRow), 0.6, RULE),
        ("BACKGROUND", (0, LastRow), (-1, LastRow), WASH),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    Words = [Paragraph("AMOUNT IN WORDS", S["label"]), Paragraph(_T(AmountInWords(Invoice.amount_paise)), S["body"])]
    if not Invoice.gst_included:
        Words.append(Spacer(1, 2 * mm))
        Words.append(Paragraph("GST is not charged on this item.", S["small"]))
    if Status == "CANCELLED" and Invoice.cancel_reason:
        Words.append(Spacer(1, 3 * mm))
        Words.append(Paragraph(f'<font color="#b91c1c"><b>Cancelled:</b></font> {_T(Invoice.cancel_reason)}', S["body"]))
    Summary = Table([[Words, Totals]], colWidths=[W * 0.6, W * 0.4])
    Summary.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    Story += [Summary, Spacer(1, 14 * mm)]

    Story += _SignatoryAndFooter(Business, "This is a computer-generated Tax Invoice.", S, W)
    return Story


def _MonthName(Month: int | None) -> str:
    return calendar.month_name[int(Month)] if Month else ""


def RenderInvoicesPdf(Invoices: Iterable[PaymentInvoice], *, Title: str = "Tax Invoice") -> bytes:
    Buffer = BytesIO()
    Doc = BaseDocTemplate(
        Buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=14 * mm,
        bottomMargin=16 * mm,
        title=Title,
        author="MathPath",
        creator="MathPath",
    )
    Body = Frame(Doc.leftMargin, Doc.bottomMargin, Doc.width, Doc.height, id="body", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    # The stamp and page footer are drawn when the page ends, once the page's
    # invoice is known.
    Doc.addPageTemplates([PageTemplate(id="invoice", frames=[Body], onPageEnd=_OnPageEnd)])
    S = _Styles()
    Story: list = []
    for Index, Invoice in enumerate(Invoices):
        if Index:
            Story.append(PageBreak())
        Story += _InvoiceStory(Invoice, S, Doc.width)
    Doc.build(Story)
    return Buffer.getvalue()


def SafeFileName(Value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "-", Value).strip("-") or "invoice"


# ----------------------------------------------------------------------------
# Money receipt (Payments Phase 3, 2026-10-08)
# ----------------------------------------------------------------------------

RECEIPT_STATUS_LABELS = {"RECORDED": "RECEIVED", "CANCELLED": "CANCELLED"}


def _ReceiptStory(Snapshot: dict[str, Any], P: dict[str, Any], S: dict[str, ParagraphStyle], W: float) -> list:
    """P is receipts_service.PaymentPayload(..., Detailed=True)."""
    Business = Snapshot.get("business") or {}
    Student = Snapshot.get("student") or {}
    Status = P["status"]
    Story: list = [_StatusMark("CANCELLED" if Status == "CANCELLED" else "PAID", P["receiptNumber"])]
    Colour = (STATUS_COLOURS["CANCELLED"] if Status == "CANCELLED" else STATUS_COLOURS["PAID"]).hexval().replace("0x", "#")
    from datetime import date as _date

    RightBlock = [
        Paragraph("MONEY RECEIPT", S["title"]),
        Spacer(1, 2 * mm),
        Paragraph(f"<b>{_T(P['receiptNumber'])}</b>", S["rightBold"]),
        Paragraph(f"Date: {_FormatDate(_date.fromisoformat(P['paymentDate']))}", S["right"]),
        Spacer(1, 1.5 * mm),
        Paragraph(f'<font color="{Colour}"><b>{RECEIPT_STATUS_LABELS.get(Status, Status)}</b></font>', S["rightBold"]),
    ]
    Story += _BusinessHeader(Business, RightBlock, S, W)
    Story += _CentreBlock(Snapshot.get("centre") or {}, S, W)

    From = [Paragraph("RECEIVED FROM", S["label"]), Paragraph(f"<b>{_T(Student.get('name'))}</b>", S["body"])]
    if Student.get("parentName"):
        From.append(Paragraph(f"Parent: {_T(Student['parentName'])}", S["body"]))
    for Part in (Student.get("mobile"), Student.get("email")):
        if Part:
            From.append(Paragraph(_T(Part), S["body"]))
    Details = [Paragraph("DETAILS", S["label"])]
    for Label, Value in [
        ("Student ID", Student.get("studentCode")),
        ("Old ID", Student.get("customId")),
        ("Level", Student.get("levelCode")),
        ("Paid by", P.get("payBy")),
        ("Received by", P.get("receivedByName")),
    ]:
        if Value:
            Details.append(Paragraph(f'<font color="#5d6478">{Label}:</font> {_T(Value)}', S["body"]))
    Parties = Table([[From, Details]], colWidths=[W * 0.55, W * 0.45])
    Parties.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, -1), 0), ("RIGHTPADDING", (-1, 0), (-1, -1), 0),
        ("LINEABOVE", (0, 0), (-1, 0), 0.6, RULE), ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    Story += [Parties, Spacer(1, 5 * mm)]

    TableStyleRows = [
        ("BACKGROUND", (0, 0), (-1, 0), WASH),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]

    # What it paid.
    Live = [Row for Row in P.get("allocations", []) if not Row["released"]]
    if Status == "CANCELLED":
        Live = [Row for Row in P.get("allocations", []) if Row.get("releaseReason") == "Payment cancelled"]
    if Live:
        Rows = [[Paragraph("#", S["cellHead"]), Paragraph("INVOICE", S["cellHead"]), Paragraph("FOR", S["cellHead"]),
                 Paragraph("PAID", S["cellHeadRight"]), Paragraph("DISCOUNT", S["cellHeadRight"]), Paragraph("STILL DUE", S["cellHeadRight"])]]
        for Index, Row in enumerate(Live, start=1):
            For = Row["feeName"] + (f" · {Row['periodLabel']}" if Row.get("periodLabel") else "")
            if Row["kind"] == "ADVANCE":
                For += " (from advance)"
            Rows.append([
                Paragraph(str(Index), S["cell"]),
                Paragraph(_T(Row["invoiceNumber"]), S["cell"]),
                Paragraph(_T(For), S["cell"]),
                Paragraph(Money(Row["amountPaise"]), S["cellRight"]),
                Paragraph(Money(Row["discountPaise"]) if Row["discountPaise"] else "-", S["cellRight"]),
                Paragraph(_T(Row["invoiceBalanceDisplay"]) if Status != "CANCELLED" else "-", S["cellRight"]),
            ])
        Applied = Table(Rows, colWidths=[W * 0.05, W * 0.2, W * 0.36, W * 0.13, W * 0.13, W * 0.13], repeatRows=1)
        Applied.setStyle(TableStyle(TableStyleRows))
        Story += [Paragraph("APPLIED TO", S["label"]), Spacer(1, 1.5 * mm), Applied, Spacer(1, 4 * mm)]

    # How it was paid.
    MethodRows = [[Paragraph("METHOD", S["cellHead"]), Paragraph("REFERENCE", S["cellHead"]), Paragraph("AMOUNT", S["cellHeadRight"])]]
    for Line in P["methods"]:
        MethodRows.append([Paragraph(_T(Line["methodLabel"]), S["cell"]), Paragraph(_T(Line.get("reference") or "-"), S["cell"]), Paragraph(Money(Line["amountPaise"]), S["cellRight"])])
    Methods = Table(MethodRows, colWidths=[W * 0.3, W * 0.45, W * 0.25], repeatRows=1)
    Methods.setStyle(TableStyle(TableStyleRows))
    Story += [Paragraph("PAYMENT METHOD", S["label"]), Spacer(1, 1.5 * mm), Methods, Spacer(1, 4 * mm)]

    # Totals.
    AppliedTotal = sum(Row["amountPaise"] for Row in Live)
    TotalRows = [("Amount received", Money(P["amountPaise"]), True)]
    if P["discountPaise"]:
        TotalRows.append(("Discount given", Money(P["discountPaise"]), False))
    TotalRows.append(("Applied to invoices", Money(AppliedTotal), False))
    if P["advancePaise"]:
        TotalRows.append(("Kept as advance", Money(P["advancePaise"]), True))
    TotalsData = [[Paragraph(Label, S["rightBold"] if Bold else S["right"]), Paragraph(Value, S["rightBold"] if Bold else S["right"])] for Label, Value, Bold in TotalRows]
    Totals = Table(TotalsData, colWidths=[W * 0.24, W * 0.16])
    Totals.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), WASH), ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5)]))
    Words = [Paragraph("AMOUNT IN WORDS", S["label"]), Paragraph(_T(AmountInWords(P["amountPaise"])), S["body"])]
    if P.get("discountReason") and P["discountPaise"]:
        Words += [Spacer(1, 2 * mm), Paragraph(f"<b>Discount:</b> {_T(P['discountReason'])}", S["small"])]
    if P["advancePaise"]:
        Words += [Spacer(1, 2 * mm), Paragraph(f"{Money(P['advancePaise'])} is held as advance and will be adjusted against future invoices.", S["small"])]
    if P.get("note"):
        Words += [Spacer(1, 2 * mm), Paragraph(f"<b>Note:</b> {_T(P['note'])}", S["small"])]
    if Status == "CANCELLED" and P.get("cancelReason"):
        Words += [Spacer(1, 3 * mm), Paragraph(f'<font color="#b91c1c"><b>Cancelled:</b></font> {_T(P["cancelReason"])}', S["body"])]
    Summary = Table([[Words, Totals]], colWidths=[W * 0.6, W * 0.4])
    Summary.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    Story += [Summary, Spacer(1, 12 * mm)]
    Story += _SignatoryAndFooter(Business, "This is a computer-generated Money Receipt.", S, W)
    return Story


def RenderReceiptsPdf(Items: Iterable[tuple[dict[str, Any], dict[str, Any]]], *, Title: str = "Money Receipt") -> bytes:
    """Items: (snapshot, PaymentPayload) per receipt, one page each."""
    Buffer = BytesIO()
    Doc = BaseDocTemplate(Buffer, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=16 * mm, title=Title, author="MathPath", creator="MathPath")
    Body = Frame(Doc.leftMargin, Doc.bottomMargin, Doc.width, Doc.height, id="body", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    Doc.addPageTemplates([PageTemplate(id="receipt", frames=[Body], onPageEnd=_OnPageEnd)])
    S = _Styles()
    Story: list = []
    for Index, (Snapshot, Payload) in enumerate(Items):
        if Index:
            Story.append(PageBreak())
        Story += _ReceiptStory(Snapshot, Payload, S, Doc.width)
    Doc.build(Story)
    return Buffer.getvalue()


# ----------------------------------------------------------------------------
# Collection summary / day close (Payments Phase 4, 2026-10-08)
# ----------------------------------------------------------------------------

def RenderCollectionSummaryPdf(Business: dict[str, Any], Report: dict[str, Any], *, FilterText: str = "", DayClose: dict[str, Any] | None = None) -> bytes:
    """One summary for a date range (a single day = the day-close sheet):
    totals by method, by staff, and every payment, with sign-off lines for
    counting the cash drawer."""
    from datetime import date as _date

    Buffer = BytesIO()
    Doc = BaseDocTemplate(Buffer, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=16 * mm, title="Collection Summary", author="MathPath", creator="MathPath")
    Body = Frame(Doc.leftMargin, Doc.bottomMargin, Doc.width, Doc.height, id="body", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    Doc.addPageTemplates([PageTemplate(id="summary", frames=[Body], onPageEnd=_OnPageEnd)])
    S = _Styles()
    W = Doc.width
    From = _date.fromisoformat(Report["dateFrom"])
    To = _date.fromisoformat(Report["dateTo"])
    Period = _FormatDate(From) if From == To else f"{_FormatDate(From)} to {_FormatDate(To)}"
    Title = "DAY CLOSE" if From == To else "COLLECTIONS"
    Story: list = [_StatusMark("SUMMARY", f"Collection summary · {Period}")]
    Story += _BusinessHeader(Business, [
        Paragraph(Title, S["title"]),
        Spacer(1, 2 * mm),
        Paragraph(f"<b>{_T(Period)}</b>", S["rightBold"]),
        Paragraph(_T(FilterText or "All methods, staff and centres"), S["right"]),
    ], S, W)

    Grid = [
        ("BACKGROUND", (0, 0), (-1, 0), WASH),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE),
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    Methods = [Row["methodLabel"] for Row in Report["byMethod"]]

    # By method.
    Rows = [[Paragraph("METHOD", S["cellHead"]), Paragraph("AMOUNT", S["cellHeadRight"])]]
    for Row in Report["byMethod"]:
        Rows.append([Paragraph(_T(Row["methodLabel"]), S["cell"]), Paragraph(Money(Row["paise"]), S["cellRight"])])
    Rows.append([Paragraph(f"<b>Total</b> ({Report['paymentCount']} payments)", S["cell"]), Paragraph(f"<b>{Money(Report['total']['paise'])}</b>", S["cellRight"])])
    Table1 = Table(Rows, colWidths=[W * 0.35, W * 0.2])
    Table1.setStyle(TableStyle(Grid))
    Table1.hAlign = "LEFT"
    Story += [Paragraph("BY METHOD", S["label"]), Spacer(1, 1.5 * mm), Table1, Spacer(1, 5 * mm)]

    # Revamp R2 (2026-10-09): the cash count. DayClose carries the live
    # figures ("figures") and, once closed, the close record ("close").
    if DayClose is not None:
        Figures = DayClose["figures"]
        Close = DayClose.get("close") if DayClose.get("state") == "CLOSED" else None
        Count = [
            [Paragraph("CASH", S["cellHead"]), Paragraph("AMOUNT", S["cellHeadRight"])],
            [Paragraph("Cash received", S["cell"]), Paragraph(Money(Figures["cashReceived"]["paise"]), S["cellRight"])],
            [Paragraph(f"Less cash paid for expenses ({Figures['expenseCount']})", S["cell"]), Paragraph(Money(Figures["cashSpent"]["paise"]), S["cellRight"])],
            [Paragraph("<b>Expected cash in hand</b>", S["cell"]), Paragraph(f"<b>{Money((Close or {}).get('expectedCash', Figures['expectedCash'])['paise'])}</b>", S["cellRight"])],
        ]
        if Close:
            Diff = Close["difference"]["paise"]
            DiffText = "Matches" if not Diff else (f"{Money(abs(Diff))} more" if Diff > 0 else f"{Money(abs(Diff))} short")
            Count += [
                [Paragraph("<b>Cash counted</b>", S["cell"]), Paragraph(f"<b>{Money(Close['countedCash']['paise'])}</b>", S["cellRight"])],
                [Paragraph("Difference", S["cell"]), Paragraph(_T(DiffText), S["cellRight"])],
            ]
        Table4 = Table(Count, colWidths=[W * 0.42, W * 0.2])
        Table4.setStyle(TableStyle(Grid[:-1] + [("LINEBELOW", (0, -1), (-1, -1), 0.6, RULE)]))
        Table4.hAlign = "LEFT"
        Story += [Paragraph("CASH COUNT", S["label"]), Spacer(1, 1.5 * mm), Table4]
        if Close and Close.get("note"):
            Story += [Spacer(1, 1.5 * mm), Paragraph(f"Note: {_T(Close['note'])}", S["body"])]
        if Close and Close.get("changedAfterClose"):
            Story += [Spacer(1, 1.5 * mm), Paragraph("<b>Changed after closing:</b> payments or expenses for this day changed after it was closed. The figures above the cash count are the current ones.", S["body"])]
        if not Close:
            Story += [Spacer(1, 1.5 * mm), Paragraph("This day has not been closed yet." if DayClose.get("state") == "OPEN" else "This day was reopened and has not been closed again.", S["body"])]
        Story += [Spacer(1, 5 * mm)]

    # By staff (staff x method).
    if Report["byStaff"]:
        Head = [Paragraph("RECEIVED BY", S["cellHead"])] + [Paragraph(_T(Method.upper()), S["cellHeadRight"]) for Method in Methods] + [Paragraph("TOTAL", S["cellHeadRight"])]
        Rows = [Head]
        for Row in Report["byStaff"]:
            Values = {M["methodLabel"]: M["paise"] for M in Row["byMethod"]}
            Rows.append([Paragraph(_T(Row["name"]), S["cell"])] + [Paragraph(Money(Values.get(Method, 0)) if Values.get(Method) else "-", S["cellRight"]) for Method in Methods] + [Paragraph(f"<b>{Money(Row['paise'])}</b>", S["cellRight"])])
        Width = (W * 0.7) / (len(Methods) + 1)
        Table2 = Table(Rows, colWidths=[W * 0.3] + [Width] * (len(Methods) + 1), repeatRows=1)
        Table2.setStyle(TableStyle(Grid[:-1] + [("LINEBELOW", (0, -1), (-1, -1), 0.6, RULE)]))
        Story += [Paragraph("BY STAFF", S["label"]), Spacer(1, 1.5 * mm), Table2, Spacer(1, 5 * mm)]

    # Every payment.
    Rows = [[Paragraph(Text, S["cellHead"] if Index < 4 else S["cellHeadRight"]) for Index, Text in enumerate(["DATE", "RECEIPT", "STUDENT", "PAID WITH", "AMOUNT"])]]
    for Row in sorted(Report.get("payments", []), key=lambda Item: (Item["paymentDate"], Item["receiptNumber"])):
        Rows.append([
            Paragraph(_FormatDate(_date.fromisoformat(Row["paymentDate"])), S["cell"]),
            Paragraph(_T(Row["receiptNumber"]), S["cell"]),
            Paragraph(_T(f"{Row['studentName']} ({Row['studentCode']})"), S["cell"]),
            Paragraph(_T(Row["methodSummary"]), S["cell"]),
            Paragraph(Money(Row["inFilterPaise"]), S["cellRight"]),
        ])
    if len(Rows) > 1:
        Table3 = Table(Rows, colWidths=[W * 0.14, W * 0.16, W * 0.3, W * 0.25, W * 0.15], repeatRows=1)
        Table3.setStyle(TableStyle(Grid[:-1] + [("LINEBELOW", (0, -1), (-1, -1), 0.6, RULE)]))
        Story += [Paragraph("PAYMENTS", S["label"]), Spacer(1, 1.5 * mm), Table3]
    else:
        Story += [Paragraph("No payments in this period.", S["body"])]

    Closed = (DayClose or {}).get("close") if (DayClose or {}).get("state") == "CLOSED" else None
    if Closed:
        from datetime import datetime as _dt
        from zoneinfo import ZoneInfo as _Zone

        When = _dt.fromisoformat(Closed["closedAt"]).astimezone(_Zone("Asia/Kolkata")).strftime("%d %b %Y, %I:%M %p").replace(" 0", " ") if Closed.get("closedAt") else ""
        CountedBy = f"Closed by: <b>{_T(Closed.get('closedByName') or 'Not recorded')}</b>" + (f", {_T(When)}" if When else "")
    else:
        CountedBy = "Cash counted by: ____________________"
    Sign = Table(
        [[Paragraph(CountedBy, S["body"]), Paragraph("Verified by: ____________________", S["right"])]],
        colWidths=[W * 0.5, W * 0.5],
    )
    Sign.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    Story += [Spacer(1, 14 * mm), KeepTogether([Sign])]
    Doc.build(Story)
    return Buffer.getvalue()
