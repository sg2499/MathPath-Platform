from __future__ import annotations

from datetime import datetime, timezone, timedelta
import asyncio
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.pdfgen import canvas as PdfCanvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


HeaderFill = PatternFill("solid", fgColor="0F172A")
HeaderFont = Font(color="FFFFFF", bold=True)
SubtleFill = PatternFill("solid", fgColor="EAF4FF")
BorderLine = Side(style="thin", color="D8E2F0")
CellBorder = Border(left=BorderLine, right=BorderLine, top=BorderLine, bottom=BorderLine)


def SafeCell(Value: Any) -> Any:
    if Value is None:
        return "-"
    if isinstance(Value, (int, float)):
        return Value
    if isinstance(Value, datetime):
        return Value.strftime("%d-%b-%Y, %I:%M %p")
    Text = str(Value)
    if Text and Text[0] in {"=", "+", "-", "@"}:
        return "'" + Text
    return Text


def NormalizeRows(Rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return [dict(Row) for Row in Rows]


def _ColumnWidth(HeaderText: str) -> float:
    Widths = {
        "Student Name": 18,
        "Student Code": 17,
        "Teacher Name": 18,
        "Teacher Code": 17,
        "Module Code": 17,
        "Module": 21,
        "Level Code": 15,
        "Level": 22,
        "Lesson": 46,
        "DPS": 54,
        "Status": 17,
        "Score": 13,
        "Total Marks": 16,
        "Accuracy %": 16,
        "Benchmark Status": 20,
        "Correct Answers": 18,
        "Completion Date": 18,
        "Completion Time": 18,
        "Time Taken": 16,
        "Required DPS": 16,
        "DPS Cleared": 17,
        "Passed DPS": 16,
        "Pending DPS": 16,
        "Needs Re-Attempt": 20,
        "Average Score": 17,
        "Average Accuracy %": 20,
        "Performance Zone": 20,
        "Assessment Readiness": 22,
        "Promotion Status": 20,
        "From Module": 16,
        "From Level": 16,
        "To Module": 16,
        "To Level": 16,
        "Promoted Levels": 18,
        "Promotion History Records": 26,
        "Promotion Assessment": 32,
        "Promotion Score": 18,
        "Promotion Percentage": 22,
        "Promoted Date": 18,
        "Promoted Time": 18,
        "Promoted By": 22,
        "Last Activity Date": 18,
        "Assessment": 30,
        "Result": 18,
    }
    if HeaderText in Widths:
        return float(Widths[HeaderText])
    if HeaderText.endswith("Code"):
        return 17.0
    if HeaderText.endswith("Name"):
        return 24.0
    if "Date" in HeaderText or "Time" in HeaderText:
        return 18.0
    if "%" in HeaderText or "Score" in HeaderText:
        return 17.0
    return 18.0


def AddRowsSheet(WorkbookValue: Workbook, Title: str, Rows: Iterable[dict[str, Any]], EmptyMessage: str = "No report data found for the selected scope."):
    Sheet = WorkbookValue.create_sheet(Title[:31])
    RowList = NormalizeRows(Rows)
    if not RowList:
        Sheet.append([EmptyMessage])
        Sheet["A1"].font = Font(bold=True, color="334155")
        Sheet["A1"].fill = SubtleFill
        Sheet["A1"].border = CellBorder
        Sheet["A1"].alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        Sheet.row_dimensions[1].height = 24
        Sheet.column_dimensions["A"].width = 58
        return Sheet

    Headers = list(RowList[0].keys())
    Sheet.append(Headers)
    for Cell in Sheet[1]:
        Cell.font = HeaderFont
        Cell.fill = HeaderFill
        Cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        Cell.border = CellBorder
    Sheet.row_dimensions[1].height = 24

    for Row in RowList:
        Sheet.append([SafeCell(Row.get(Header)) for Header in Headers])

    for RowIndex, RowCells in enumerate(Sheet.iter_rows(min_row=2), start=2):
        Sheet.row_dimensions[RowIndex].height = 28
        for Cell in RowCells:
            Cell.border = CellBorder
            Cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

    Sheet.freeze_panes = "A2"
    Sheet.auto_filter.ref = Sheet.dimensions
    for Index, Header in enumerate(Headers, start=1):
        Sheet.column_dimensions[get_column_letter(Index)].width = _ColumnWidth(str(Header))
    return Sheet

def AddSummarySheet(WorkbookValue: Workbook, SummaryRows: Iterable[tuple[str, Any]]):
    Sheet = WorkbookValue.active
    Sheet.title = "Report Summary"
    Sheet.append(["Report Field", "Report Value"])
    for Cell in Sheet[1]:
        Cell.font = HeaderFont
        Cell.fill = HeaderFill
        Cell.border = CellBorder
        Cell.alignment = Alignment(horizontal="center", vertical="center")
    Sheet.row_dimensions[1].height = 24
    for Label, Value in SummaryRows:
        Sheet.append([SafeCell(Label), SafeCell(Value)])
    for RowIndex, RowCells in enumerate(Sheet.iter_rows(min_row=2), start=2):
        Sheet.row_dimensions[RowIndex].height = 22
        for Cell in RowCells:
            Cell.border = CellBorder
            Cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        RowCells[0].font = Font(bold=True, color="334155")
        RowCells[0].fill = SubtleFill
    Sheet.column_dimensions["A"].width = 32
    Sheet.column_dimensions["B"].width = 58
    Sheet.freeze_panes = "A2"
    return Sheet

def BuildWorkbookResponse(FileName: str, SummaryRows: Iterable[tuple[str, Any]], Sheets: list[tuple[str, Iterable[dict[str, Any]]]]) -> StreamingResponse:
    WorkbookValue = Workbook()
    AddSummarySheet(WorkbookValue, list(SummaryRows))
    for Title, Rows in Sheets:
        AddRowsSheet(WorkbookValue, Title, Rows)

    Buffer = BytesIO()
    WorkbookValue.save(Buffer)
    Buffer.seek(0)
    SafeFileName = FileName if FileName.lower().endswith(".xlsx") else f"{FileName}.xlsx"
    return StreamingResponse(
        Buffer,
        media_type=EXCEL_MIME,
        headers={"Content-Disposition": f'attachment; filename="{SafeFileName}"'},
    )


def ReportGeneratedOn() -> str:
    IndiaTime = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    return IndiaTime.strftime("%d-%b-%Y, %I:%M %p")

PDF_MIME = "application/pdf"


BrandNavy = colors.HexColor("#07122F")
BrandBlue = colors.HexColor("#2563EB")
BrandCyan = colors.HexColor("#06B6D4")
BrandTeal = colors.HexColor("#0EA5A8")
SoftBlue = colors.HexColor("#EEF7FF")
SoftCyan = colors.HexColor("#ECFEFF")
SoftSlate = colors.HexColor("#F8FAFC")
CardBorder = colors.HexColor("#DDEBFA")
TextSlate = colors.HexColor("#334155")
MutedSlate = colors.HexColor("#64748B")
SuccessGreen = colors.HexColor("#10B981")
Purple = colors.HexColor("#7C3AED")


def _PdfText(Value: Any) -> str:
    Text = SafeCell(Value)
    Text = str(Text).replace("—", "-").replace("–", "-").replace("•", "-").replace("’", "'")
    return Text


def _FindMathPathLogo() -> str | None:
    CurrentFile = Path(__file__).resolve()
    CandidatePaths = []
    for Parent in CurrentFile.parents:
        CandidatePaths.extend([
            Parent / "frontend" / "public" / "mathpath-logo.png",
            Parent / "public" / "mathpath-logo.png",
            Parent / "app" / "icon.png",
            Parent / "frontend" / "app" / "icon.png",
        ])
    for Candidate in CandidatePaths:
        if Candidate.exists() and Candidate.is_file():
            return str(Candidate)
    return None


class _HeroBanner(Flowable):
    def __init__(self, StudentName: str, StudentCode: str, ClassSection: str, GeneratedOn: str, LogoPath: str | None):
        super().__init__()
        self.Width = 186 * mm
        self.Height = 38 * mm
        self.StudentName = StudentName
        self.StudentCode = StudentCode
        self.ClassSection = ClassSection
        self.GeneratedOn = GeneratedOn
        self.LogoPath = LogoPath

    def wrap(self, AvailableWidth, AvailableHeight):
        self.Width = AvailableWidth
        return AvailableWidth, self.Height

    def draw(self):
        Canvas = self.canv
        Canvas.saveState()
        Canvas.setFillColor(SoftCyan)
        Canvas.setStrokeColor(colors.HexColor("#BDEFFF"))
        Canvas.roundRect(0, 0, self.Width, self.Height, 16, fill=1, stroke=1)
        Canvas.setFillColor(colors.Color(0.75, 0.95, 1.0, alpha=0.35))
        Canvas.circle(self.Width - 28 * mm, self.Height - 10 * mm, 28 * mm, stroke=0, fill=1)
        Canvas.setFillColor(colors.Color(0.70, 0.90, 1.0, alpha=0.25))
        Canvas.circle(self.Width - 8 * mm, 14 * mm, 22 * mm, stroke=0, fill=1)

        LogoX = 12 * mm
        LogoY = self.Height - 18 * mm
        if self.LogoPath:
            try:
                Canvas.drawImage(self.LogoPath, LogoX, LogoY, width=16 * mm, height=16 * mm, mask="auto", preserveAspectRatio=True)
            except Exception:
                Canvas.setFillColor(colors.white)
                Canvas.roundRect(LogoX, LogoY, 16 * mm, 16 * mm, 7, fill=1, stroke=0)
        else:
            Canvas.setFillColor(colors.white)
            Canvas.roundRect(LogoX, LogoY, 16 * mm, 16 * mm, 7, fill=1, stroke=0)

        TextX = 32 * mm
        Canvas.setFillColor(BrandNavy)
        Canvas.setFont("Helvetica-Bold", 18)
        Canvas.drawString(TextX, self.Height - 10 * mm, "MathPath")
        Canvas.setFillColor(BrandTeal)
        Canvas.setFont("Helvetica-Bold", 7.5)
        Canvas.drawString(TextX, self.Height - 15 * mm, "ACE WITH ABACUS")
        Canvas.setFillColor(TextSlate)
        Canvas.setFont("Helvetica", 8.5)
        Canvas.drawString(TextX, self.Height - 20 * mm, "Visual Abacus Mastery for Speed, Accuracy, and Confidence.")

        Canvas.setFillColor(BrandNavy)
        Canvas.setFont("Helvetica-Bold", 19)
        Canvas.drawString(12 * mm, 12.5 * mm, "Parent Progress Report")
        Canvas.setFillColor(TextSlate)
        Canvas.setFont("Helvetica", 8.4)
        Canvas.drawString(12 * mm, 7.2 * mm, "A concise, parent-friendly summary generated from verified MathPath records.")

        CardW = 58 * mm
        CardH = 20 * mm
        CardX = self.Width - CardW - 12 * mm
        CardY = 8 * mm
        Canvas.setFillColor(colors.white)
        Canvas.setStrokeColor(colors.HexColor("#D8EAFE"))
        Canvas.roundRect(CardX, CardY, CardW, CardH, 9, fill=1, stroke=1)
        Canvas.setFillColor(MutedSlate)
        Canvas.setFont("Helvetica-Bold", 6.8)
        Canvas.drawString(CardX + 5 * mm, CardY + 13.4 * mm, "STUDENT")
        Canvas.setFillColor(BrandNavy)
        Canvas.setFont("Helvetica-Bold", 9.2)
        Canvas.drawString(CardX + 5 * mm, CardY + 9.2 * mm, self.StudentName[:31])
        Canvas.setFillColor(TextSlate)
        Canvas.setFont("Helvetica", 7.2)
        Canvas.drawString(CardX + 5 * mm, CardY + 4.8 * mm, f"{self.StudentCode} | {self.ClassSection}")
        Canvas.setFillColor(MutedSlate)
        Canvas.setFont("Helvetica", 6.2)
        Canvas.drawRightString(CardX + CardW - 5 * mm, CardY + 4.8 * mm, self.GeneratedOn[:22])
        Canvas.restoreState()


class _SectionDivider(Flowable):
    def __init__(self, Kicker: str, Title: str):
        super().__init__()
        self.Kicker = Kicker
        self.Title = Title
        self.Height = 15 * mm

    def wrap(self, AvailableWidth, AvailableHeight):
        self.Width = AvailableWidth
        return AvailableWidth, self.Height

    def draw(self):
        Canvas = self.canv
        Canvas.saveState()
        Canvas.setFillColor(BrandCyan)
        Canvas.setFont("Helvetica-Bold", 7.4)
        Canvas.drawString(0, self.Height - 5, self.Kicker.upper())
        Canvas.setFillColor(BrandNavy)
        Canvas.setFont("Helvetica-Bold", 13.5)
        Canvas.drawString(0, 1, self.Title)
        Canvas.setStrokeColor(colors.HexColor("#DDEBFA"))
        Canvas.setLineWidth(0.8)
        Canvas.line(0, 0, self.Width, 0)
        Canvas.restoreState()


def _Styles() -> dict[str, ParagraphStyle]:
    return {
        "Body": ParagraphStyle(
            "MathPathBody",
            fontName="Helvetica",
            fontSize=9.4,
            leading=13.4,
            textColor=TextSlate,
            spaceAfter=0,
        ),
        "Small": ParagraphStyle(
            "MathPathSmall",
            fontName="Helvetica",
            fontSize=8.0,
            leading=11.2,
            textColor=MutedSlate,
        ),
        "CardLabel": ParagraphStyle(
            "MathPathCardLabel",
            fontName="Helvetica-Bold",
            fontSize=6.8,
            leading=8.0,
            textColor=MutedSlate,
            alignment=TA_LEFT,
        ),
        "CardValue": ParagraphStyle(
            "MathPathCardValue",
            fontName="Helvetica-Bold",
            fontSize=10.3,
            leading=12.6,
            textColor=BrandNavy,
            alignment=TA_LEFT,
        ),
        "Chip": ParagraphStyle(
            "MathPathChip",
            fontName="Helvetica-Bold",
            fontSize=8.0,
            leading=9.5,
            textColor=BrandBlue,
            alignment=TA_CENTER,
        ),
        "TableCell": ParagraphStyle(
            "MathPathTableCell",
            fontName="Helvetica",
            fontSize=8.0,
            leading=10.0,
            textColor=TextSlate,
        ),
        "TableCellBold": ParagraphStyle(
            "MathPathTableCellBold",
            fontName="Helvetica-Bold",
            fontSize=8.0,
            leading=10.0,
            textColor=BrandNavy,
        ),
    }


def _Paragraph(TextValue: Any, Style: ParagraphStyle) -> Paragraph:
    Text = _PdfText(TextValue)
    Escaped = Text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(Escaped, Style)


def _CardGrid(Items: list[tuple[str, Any]], Columns: int, Styles: dict[str, ParagraphStyle], AccentColor=BrandBlue) -> Table:
    Rows = []
    for Index in range(0, len(Items), Columns):
        RowItems = Items[Index:Index + Columns]
        Cells = []
        for Label, Value in RowItems:
            Cells.append([
                _Paragraph(str(Label).upper(), Styles["CardLabel"]),
                Spacer(1, 2),
                _Paragraph(Value, Styles["CardValue"]),
            ])
        while len(Cells) < Columns:
            Cells.append("")
        Rows.append(Cells)
    TableValue = Table(Rows, colWidths=[None] * Columns, hAlign="LEFT")
    TableValue.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SoftSlate),
        ("BOX", (0, 0), (-1, -1), 0.55, CardBorder),
        ("INNERGRID", (0, 0), (-1, -1), 0.55, colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEABOVE", (0, 0), (-1, 0), 2.0, AccentColor),
    ]))
    return TableValue


def _MessagePanel(Title: str, Message: Any, Styles: dict[str, ParagraphStyle], AccentColor=BrandTeal) -> Table:
    Panel = Table([
        [_Paragraph(Title.upper(), Styles["CardLabel"])],
        [_Paragraph(Message, Styles["Body"])],
    ], colWidths=[None])
    Panel.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F0FDFA")),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#BEEFE6")),
        ("LINEBEFORE", (0, 0), (0, -1), 3.2, AccentColor),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return Panel


def _HighlightsPanel(Highlights: list[Any], Styles: dict[str, ParagraphStyle]) -> Table:
    CleanHighlights = [str(_PdfText(Item)) for Item in Highlights if str(_PdfText(Item)).strip()]
    if not CleanHighlights:
        CleanHighlights = ["Progress highlights will appear as learning records are completed."]
    Rows = [[_Paragraph("PROGRESS HIGHLIGHTS", Styles["CardLabel"] )]]
    for Index, Item in enumerate(CleanHighlights[:4], start=1):
        Rows.append([_Paragraph(f"{Index}. {Item}", Styles["Small"])])
    Panel = Table(Rows, colWidths=[None])
    Panel.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FBFF")),
        ("BOX", (0, 0), (-1, -1), 0.7, CardBorder),
        ("LINEBEFORE", (0, 0), (0, -1), 3.0, SuccessGreen),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return Panel


def _CurrentDetailsPanel(CurrentLevel: dict[str, Any], Styles: dict[str, ParagraphStyle]) -> Table:
    Rows = [[_Paragraph("CURRENT LEVEL DETAILS", Styles["CardLabel"] )]]
    DetailItems = [
        ("Current Module", CurrentLevel.get("module", "-")),
        ("Current Level", CurrentLevel.get("level", "-")),
        ("Level Status", CurrentLevel.get("status", "-")),
        ("Practice", CurrentLevel.get("practiceProgress", "-")),
        ("Practice Accuracy", CurrentLevel.get("practiceAccuracy", "-")),
        ("Assessment", CurrentLevel.get("assessmentStatus", "-")),
    ]
    for Label, Value in DetailItems:
        Rows.append([_Paragraph(f"{_PdfText(Label)}: {_PdfText(Value)}", Styles["Small"])])
    Panel = Table(Rows, colWidths=[None])
    Panel.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F0FDFA")),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#BEEFE6")),
        ("LINEBEFORE", (0, 0), (0, -1), 3.0, BrandCyan),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return Panel


def _PromotionTable(Promotions: list[dict[str, Any]], Styles: dict[str, ParagraphStyle]) -> Table:
    HeaderStyle = ParagraphStyle(
        "MathPathPromotionHeader",
        fontName="Helvetica-Bold",
        fontSize=7.0,
        leading=8.5,
        textColor=colors.white,
        alignment=TA_LEFT,
    )
    Headers = ["From", "To", "Assessment", "Score", "Date"]
    Rows: list[list[Any]] = [[_Paragraph(Header.upper(), HeaderStyle) for Header in Headers]]
    VisiblePromotions = Promotions[:4]
    for Item in VisiblePromotions:
        Rows.append([
            _Paragraph(Item.get("fromLevel", "-"), Styles["TableCellBold"]),
            _Paragraph(Item.get("toLevel", "-"), Styles["TableCellBold"]),
            _Paragraph(Item.get("assessment", "-"), Styles["TableCell"]),
            _Paragraph(Item.get("score", "-"), Styles["TableCellBold"]),
            _Paragraph(Item.get("date", "-"), Styles["TableCell"]),
        ])
    if not VisiblePromotions:
        Rows.append([_Paragraph("No completed level movement has been recorded yet.", Styles["TableCell"]), "", "", "", ""])
    Widths = [24 * mm, 24 * mm, 60 * mm, 27 * mm, 42 * mm]
    TableValue = Table(Rows, colWidths=Widths, repeatRows=1, hAlign="LEFT")
    TableValue.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BrandNavy),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.7, CardBorder),
        ("INNERGRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#E5EEF8")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("SPAN", (0, 1), (-1, 1)) if not VisiblePromotions else ("LINEBEFORE", (0, 1), (0, -1), 0, colors.white),
    ]))
    return TableValue


def _DrawParentReportFooter(Canvas, Doc):
    Canvas.saveState()
    Width, _ = A4
    Canvas.setStrokeColor(colors.HexColor("#E2E8F0"))
    Canvas.setLineWidth(0.6)
    Canvas.line(15 * mm, 13 * mm, Width - 15 * mm, 13 * mm)
    Canvas.setFillColor(MutedSlate)
    Canvas.setFont("Helvetica", 7.2)
    Canvas.drawString(15 * mm, 8 * mm, "Generated from MathPath learning, practice, assessment, and promotion records.")
    Canvas.drawRightString(Width - 15 * mm, 8 * mm, f"Page {Doc.page}")
    Canvas.restoreState()


def BuildParentProgressPdfResponse(FileName: str, ReportData: dict[str, Any]) -> StreamingResponse:
    Student = ReportData.get("student", {}) or {}
    Summary = ReportData.get("summary", {}) or {}
    Snapshot = ReportData.get("snapshot", []) or []
    CurrentLevel = ReportData.get("currentLevel", {}) or {}
    Promotions = ReportData.get("promotions", []) or []
    Highlights = ReportData.get("highlights", []) or []
    GeneratedOnValue = ReportData.get("generatedOn") or ReportGeneratedOn()
    Styles = _Styles()
    LogoPath = _FindMathPathLogo()

    Buffer = BytesIO()
    Document = SimpleDocTemplate(
        Buffer,
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=14 * mm,
        bottomMargin=18 * mm,
        title="MathPath Parent Progress Report",
        author="MathPath",
    )

    Story: list[Any] = []
    Story.append(_HeroBanner(
        _PdfText(Student.get("name", "-")),
        _PdfText(Student.get("code", "-")),
        _PdfText(Student.get("classSection", "-")),
        _PdfText(GeneratedOnValue),
        LogoPath,
    ))
    Story.append(Spacer(1, 5 * mm))

    Story.append(KeepTogether([
        _SectionDivider("Learning Snapshot", "Journey Summary"),
        Spacer(1, 2.5 * mm),
        _MessagePanel("Parent-Friendly Summary", Summary.get("message") or "The learner's progress summary is available below.", Styles),
        Spacer(1, 3 * mm),
        _CardGrid([(str(Item.get("label", "-")), Item.get("value", "-")) for Item in Snapshot], 3, Styles, BrandBlue),
    ]))
    Story.append(Spacer(1, 4.5 * mm))

    Story.append(KeepTogether([
        _SectionDivider("Progress Highlights", "What This Means"),
        Spacer(1, 2.5 * mm),
        _HighlightsPanel(Highlights, Styles),
    ]))
    Story.append(Spacer(1, 4.5 * mm))

    Story.append(KeepTogether([
        _SectionDivider("Completed Movement", "Promotion Journey"),
        Spacer(1, 2.5 * mm),
        _PromotionTable(Promotions, Styles),
    ]))

    SafeFileName = FileName if FileName.lower().endswith(".pdf") else f"{FileName}.pdf"
    Document.build(Story, onFirstPage=_DrawParentReportFooter, onLaterPages=_DrawParentReportFooter)
    Buffer.seek(0)
    return StreamingResponse(
        Buffer,
        media_type=PDF_MIME,
        headers={"Content-Disposition": f'attachment; filename="{SafeFileName}"'},
    )

# -----------------------------------------------------------------------------
# Phase 8.7.3.1.6 - Student Progress Report final premium renderer
# -----------------------------------------------------------------------------

SprInk = colors.HexColor("#07122F")
SprText = colors.HexColor("#24324A")
SprMuted = colors.HexColor("#66748E")
SprLine = colors.HexColor("#DCE8F7")
SprPanel = colors.HexColor("#FFFFFF")
SprPage = colors.HexColor("#F3F8FF")
SprBlue = colors.HexColor("#2563EB")
SprCyan = colors.HexColor("#05B6D4")
SprTeal = colors.HexColor("#0FAD9F")
SprGreen = colors.HexColor("#059669")
SprPurple = colors.HexColor("#7C3AED")
SprAmber = colors.HexColor("#F59E0B")
SprRose = colors.HexColor("#EF4444")
SprGold = colors.HexColor("#FBBF24")
SprFontRegular = "Helvetica"
SprFontBold = "Helvetica-Bold"


def _RegisterSprFonts():
    global SprFontRegular, SprFontBold
    CandidatePairs = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"),
        ("C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/arialbd.ttf"),
        ("C:/Windows/Fonts/calibri.ttf", "C:/Windows/Fonts/calibrib.ttf"),
    ]
    for RegularPath, BoldPath in CandidatePairs:
        try:
            if Path(RegularPath).exists() and Path(BoldPath).exists():
                pdfmetrics.registerFont(TTFont("MathPathReport-Regular", RegularPath))
                pdfmetrics.registerFont(TTFont("MathPathReport-Bold", BoldPath))
                SprFontRegular = "MathPathReport-Regular"
                SprFontBold = "MathPathReport-Bold"
                return
        except Exception:
            continue


_RegisterSprFonts()


def _SprStyle(Name: str, Size: float, Leading: float, Color=SprText, Bold: bool = False, Align=TA_LEFT) -> ParagraphStyle:
    return ParagraphStyle(
        Name,
        fontName=SprFontBold if Bold else SprFontRegular,
        fontSize=Size,
        leading=Leading,
        textColor=Color,
        alignment=Align,
        spaceAfter=0,
        spaceBefore=0,
    )


def _SprEsc(Value: Any) -> str:
    return _PdfText(Value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _SprPara(Canvas, TextValue: Any, X: float, TopY: float, Width: float, Style: ParagraphStyle) -> float:
    Value = Paragraph(_SprEsc(TextValue), Style)
    _, Height = Value.wrap(Width, 140 * mm)
    Value.drawOn(Canvas, X, TopY - Height)
    return Height


def _SprPanel(Canvas, X: float, Y: float, W: float, H: float, Fill=SprPanel, Stroke=SprLine, Radius: float = 12, StrokeWidth: float = 0.75):
    Canvas.saveState()
    Canvas.setFillColor(Fill)
    Canvas.setStrokeColor(Stroke)
    Canvas.setLineWidth(StrokeWidth)
    Canvas.roundRect(X, Y, W, H, Radius, fill=1, stroke=1)
    Canvas.restoreState()


def _SprBackground(Canvas, PageNumber: int = 1):
    Width, Height = A4
    Canvas.saveState()
    Canvas.setFillColor(SprPage)
    Canvas.rect(0, 0, Width, Height, fill=1, stroke=0)
    Canvas.setFillColor(colors.Color(0.82, 0.96, 1.0, alpha=0.55))
    Canvas.circle(Width + 12 * mm, Height - 12 * mm, 48 * mm, fill=1, stroke=0)
    Canvas.setFillColor(colors.Color(0.90, 0.86, 1.0, alpha=0.35))
    Canvas.circle(-8 * mm, 35 * mm, 42 * mm, fill=1, stroke=0)
    Canvas.setFillColor(colors.Color(0.86, 0.98, 0.96, alpha=0.45))
    Canvas.circle(Width - 18 * mm, 58 * mm, 36 * mm, fill=1, stroke=0)
    Canvas.setFillColor(colors.HexColor("#D8F7FF"))
    for X in range(18, int(Width), 20):
        for Y in range(22, int(Height), 20):
            if (X * 3 + Y + PageNumber) % 97 == 0:
                Canvas.circle(X, Y, 0.42, fill=1, stroke=0)
    Canvas.restoreState()


def _SprLogo(Canvas, LogoPath: str | None, X: float, Y: float, W: float, H: float, Large: bool = False):
    Canvas.saveState()
    _SprPanel(Canvas, X - 7, Y - 6, W + 14, H + 12, colors.white, colors.HexColor("#CFE4F6"), 13 if Large else 9, 0.8)
    if LogoPath:
        try:
            Canvas.drawImage(LogoPath, X, Y, W, H, preserveAspectRatio=True, mask="auto", anchor="c")
        except Exception:
            Canvas.setFillColor(SprInk)
            Canvas.setFont(SprFontBold, 17 if Large else 10)
            Canvas.drawCentredString(X + W / 2, Y + H / 2 - 3, "MathPath")
    else:
        Canvas.setFillColor(SprInk)
        Canvas.setFont(SprFontBold, 17 if Large else 10)
        Canvas.drawCentredString(X + W / 2, Y + H / 2 - 3, "MathPath")
    Canvas.restoreState()


def _SprFooter(Canvas, PageNumber: int, ReportLevel: str):
    W, _ = A4
    L = 15 * mm
    R = W - 15 * mm
    Canvas.saveState()
    Canvas.setStrokeColor(colors.HexColor("#DDE8F7"))
    Canvas.line(L, 13.2 * mm, R, 13.2 * mm)
    Canvas.setFillColor(SprMuted)
    Canvas.setFont(SprFontRegular, 7.0)
    Canvas.drawString(L, 8.6 * mm, f"MathPath Student Progress Report - {ReportLevel}")
    Canvas.drawRightString(R, 8.6 * mm, f"Page {PageNumber}")
    Canvas.restoreState()


def _SprTextWidth(Canvas, TextValue: Any, FontName: str, Size: float) -> float:
    return Canvas.stringWidth(_PdfText(TextValue), FontName, Size)


def _SprFittedFontSize(Canvas, TextValue: Any, MaxWidth: float, Start: float, MinSize: float = 6.6, FontName: str | None = None) -> float:
    FontName = FontName or SprFontBold
    Size = Start
    while Size > MinSize and _SprTextWidth(Canvas, TextValue, FontName, Size) > MaxWidth:
        Size -= 0.25
    return Size


def _SprLabel(Canvas, Label: str, X: float, Y: float, Size: float = 6.8, Color=SprMuted):
    Canvas.setFillColor(Color)
    Canvas.setFont(SprFontBold, Size)
    Canvas.drawString(X, Y, Label.upper())


def _SprValue(Canvas, Value: Any, X: float, TopY: float, W: float, Size: float = 10.2, Color=SprInk):
    Fitted = _SprFittedFontSize(Canvas, Value, W, Size, 7.0, SprFontBold)
    return _SprPara(Canvas, Value, X, TopY, W, _SprStyle("SprValue", Fitted, Fitted + 2.4, Color, True))


def _SprInfoCell(Canvas, Label: str, Value: Any, X: float, Y: float, W: float, H: float, Accent=SprBlue, Fill=colors.white):
    _SprPanel(Canvas, X, Y, W, H, Fill, colors.HexColor("#E2ECF8"), 10, 0.7)
    Canvas.saveState()
    Canvas.setFillColor(Accent)
    Canvas.roundRect(X, Y + H - 3.8, W, 3.8, 1.8, fill=1, stroke=0)
    _SprLabel(Canvas, Label, X + 8, Y + H - 14.2, 6.8)
    _SprValue(Canvas, Value, X + 8, Y + H - 20.3, W - 16, 10.3)
    Canvas.restoreState()


def _SprPerformanceColor(PercentageValue: str):
    try:
        Numeric = float(str(PercentageValue).replace("%", "").strip())
    except Exception:
        Numeric = 0.0
    if Numeric >= 90:
        return SprGreen
    if Numeric >= 70:
        return SprBlue
    return SprRose


def _SprPerformanceBand(PercentageValue: str) -> str:
    try:
        Numeric = float(str(PercentageValue).replace("%", "").strip())
    except Exception:
        Numeric = 0.0
    if Numeric >= 90:
        return "Excellence Zone"
    if Numeric >= 70:
        return "Milestone Cleared"
    return "More Practice Recommended"


def _SprParentProgressCopy(PercentageValue: str, FirstName: str, ReportLevel: str, NextLevel: str, BandLabel: str) -> dict[str, str]:
    try:
        Numeric = float(str(PercentageValue).replace("%", "").strip())
    except Exception:
        Numeric = 0.0

    NextLevelValue = str(NextLevel or "").strip()
    NextLevelAvailable = NextLevelValue not in {"", "-", "Next Level", "Next Level Pending Setup"}

    if Numeric >= 90:
        if not NextLevelAvailable:
            return {
                "takeaway": f"{FirstName} has completed {ReportLevel} with excellent assessment performance. The next structured MathPath level is pending setup.",
                "intro": f"Use this strong milestone to keep {FirstName} motivated while the next learning step is prepared.",
                "celebrate": f"Recognize {FirstName}'s excellent completion of {ReportLevel} and the focus shown during the assessment milestone.",
                "nextFocus": "Keep the learning routine steady while the next MathPath level is prepared.",
                "atHome": "Keep practice short, regular, and encouraging so confidence and consistency continue together.",
                "note": f"{FirstName}'s report records the completed level, strong assessment outcome, practice performance, and next structured learning step status.",
            }
        return {
            "takeaway": f"{FirstName} has completed {ReportLevel} with excellent assessment performance and is ready for the next structured MathPath step.",
            "intro": f"Use this strong milestone to keep {FirstName} motivated while maintaining a steady and balanced learning routine.",
            "celebrate": f"Recognize {FirstName}'s excellent completion of {ReportLevel} and the focus shown during the assessment milestone.",
            "nextFocus": f"Begin {NextLevel} with confidence while continuing the same accuracy-first learning habits.",
            "atHome": "Keep practice short, regular, and encouraging so confidence and consistency continue together.",
            "note": f"{FirstName}'s report records the completed level, strong assessment outcome, practice performance, and next structured learning step.",
        }

    if not NextLevelAvailable:
        return {
            "takeaway": f"{FirstName} has completed {ReportLevel} and cleared the assessment milestone. The next structured MathPath level is pending setup.",
            "intro": f"Use this completed-level milestone to support {FirstName} with calm, regular practice while the next step is prepared.",
            "celebrate": f"Appreciate {FirstName}'s completion of {ReportLevel} and the effort shown in clearing the assessment milestone.",
            "nextFocus": "Maintain steady accuracy habits while the next MathPath level is prepared.",
            "atHome": "Encourage steady practice, avoid pressure for speed, and give positive feedback for careful work.",
            "note": f"{FirstName}'s report records the completed level, assessment clearance, practice performance, and next structured learning step status.",
        }

    return {
        "takeaway": f"{FirstName} has completed {ReportLevel}, cleared the assessment milestone, and is ready to begin the next structured MathPath step.",
        "intro": f"Use this completed-level milestone to support {FirstName} with calm, regular practice and steady confidence-building.",
        "celebrate": f"Appreciate {FirstName}'s completion of {ReportLevel} and the effort shown in clearing the assessment milestone.",
        "nextFocus": f"Start {NextLevel} gradually while continuing to strengthen accuracy and confidence.",
        "atHome": "Encourage steady practice, avoid pressure for speed, and give positive feedback for careful work.",
        "note": f"{FirstName}'s report records the completed level, assessment clearance, practice performance, and next structured learning step.",
    }


def _SprDrawStatusPill(Canvas, TextValue: str, X: float, Y: float, W: float, FillColor, TextColor=SprInk):
    Canvas.saveState()
    Canvas.setFillColor(FillColor)
    Canvas.roundRect(X, Y, W, 17, 8.5, fill=1, stroke=0)
    Canvas.setFillColor(TextColor)
    Canvas.setFont(SprFontBold, 7.2)
    Size = _SprFittedFontSize(Canvas, TextValue, W - 12, 7.2, 5.8, SprFontBold)
    Canvas.setFont(SprFontBold, Size)
    Canvas.drawCentredString(X + W / 2, Y + 5.0, _PdfText(TextValue))
    Canvas.restoreState()


def _SprScoreDonut(Canvas, X: float, Y: float, ScoreText: str, Percentage: str):
    Canvas.saveState()
    try:
        Numeric = max(0.0, min(100.0, float(str(Percentage).replace("%", "").strip())))
    except Exception:
        Numeric = 0.0
    ProgressColor = _SprPerformanceColor(Percentage)
    Canvas.setStrokeColor(colors.HexColor("#D9E7F7"))
    Canvas.setLineWidth(12)
    Canvas.circle(X, Y, 32, stroke=1, fill=0)
    Canvas.setStrokeColor(ProgressColor)
    Canvas.setLineWidth(12)
    if Numeric >= 99.5:
        Canvas.circle(X, Y, 32, stroke=1, fill=0)
    elif Numeric > 0:
        Canvas.arc(X - 32, Y - 32, X + 32, Y + 32, 90, -360 * Numeric / 100.0)
    Canvas.setFillColor(colors.white)
    Canvas.circle(X, Y, 23, stroke=0, fill=1)
    Canvas.setFillColor(SprInk)
    Canvas.setFont(SprFontBold, 16)
    Canvas.drawCentredString(X, Y + 4, _PdfText(Percentage))
    Canvas.setFillColor(SprMuted)
    Canvas.setFont(SprFontBold, 7.2)
    Canvas.drawCentredString(X, Y - 11, _PdfText(ScoreText))
    Canvas.restoreState()


def _SprHeaderMini(Canvas, LogoPath: str | None, Title: str, StudentCode: str, GeneratedOn: str):
    W, H = A4
    L = 15 * mm
    R = W - 15 * mm
    Top = H - 16 * mm
    _SprLogo(Canvas, LogoPath, L, Top - 15 * mm, 40 * mm, 15 * mm, False)
    Canvas.setFillColor(SprInk)
    Canvas.setFont(SprFontBold, 13)
    Canvas.drawRightString(R, Top - 4, Title)
    Canvas.setFillColor(SprMuted)
    Canvas.setFont(SprFontRegular, 7.5)
    Canvas.drawRightString(R, Top - 15.5, f"{StudentCode} | {GeneratedOn}")


def _SprSlug(Value: Any) -> str:
    Text = _PdfText(Value).strip().replace("/", "-").replace("\\", "-")
    Parts = [Part for Part in Text.replace(" ", "_").split("_") if Part]
    return "_".join(Parts) or "Student"


def BuildParentProgressPdfResponse(FileName: str, ReportData: dict[str, Any]) -> StreamingResponse:
    Student = ReportData.get("student", {}) or {}
    Report = ReportData.get("report", {}) or {}
    Performance = ReportData.get("performance", {}) or {}
    Summary = ReportData.get("summary", {}) or {}
    Movements = ReportData.get("movements", []) or []

    StudentName = _PdfText(Student.get("name", "-"))
    StudentCode = _PdfText(Student.get("code", "-"))
    ClassSection = _PdfText(Student.get("classSection", "-"))
    GeneratedOn = _PdfText(ReportData.get("generatedOn") or Report.get("generatedOn") or ReportGeneratedOn())
    ReportLevel = _PdfText(Report.get("reportLevelCode", "-"))
    ReportModuleCode = _PdfText(Report.get("reportModuleCode", "-"))
    ReportModuleName = _PdfText(Report.get("reportModuleName") or Report.get("reportModuleCode") or "-")
    ModuleDisplayNames = {"YLM": "Young Learners Module"}
    if ReportModuleName == ReportModuleCode and ReportModuleCode in ModuleDisplayNames:
        ReportModuleName = ModuleDisplayNames[ReportModuleCode]
    if not ReportModuleName or ReportModuleName == "-":
        ReportModuleName = ModuleDisplayNames.get(ReportModuleCode, ReportModuleCode or "Learning Journey")

    NextLevel = _PdfText(Report.get("nextLevelCode", "-"))
    NextLevelName = _PdfText(Report.get("nextLevelName") or NextLevel)
    AssessmentName = _PdfText(Performance.get("assessmentName", "Level Assessment"))
    AssessmentScore = _PdfText(Performance.get("assessmentScore", "-"))
    AssessmentPercentage = _PdfText(Performance.get("assessmentPercentage", "-"))
    AssessmentResult = _PdfText(Performance.get("assessmentResult", "Assessment Milestone Cleared"))
    AssessmentDate = _PdfText(Performance.get("assessmentDate", "-"))
    PracticeProgress = _PdfText(Performance.get("practiceProgress", "-"))
    PracticeAccuracy = _PdfText(Performance.get("practiceAccuracy", "-"))
    Message = _PdfText(Summary.get("message", "The student's progress summary is ready for review."))
    NextStep = _PdfText(Summary.get("nextStep", f"Begin {NextLevel} Practice"))
    FirstName = StudentName.split()[0] if StudentName and StudentName != "-" else "The student"
    LogoPath = _FindMathPathLogo()
    BandLabel = _SprPerformanceBand(AssessmentPercentage)
    DynamicCopy = _SprParentProgressCopy(AssessmentPercentage, FirstName, ReportLevel, NextLevel, BandLabel)
    AccentColor = _SprPerformanceColor(AssessmentPercentage)
    PillFill = colors.HexColor("#D1FAE5") if AccentColor == SprGreen else colors.HexColor("#DBEAFE") if AccentColor == SprBlue else colors.HexColor("#FEE2E2")

    Buffer = BytesIO()
    Pdf = PdfCanvas.Canvas(Buffer, pagesize=A4)
    PageW, PageH = A4
    L = 14 * mm
    R = PageW - 14 * mm
    CW = R - L

    Heading = _SprStyle("SprReportHeading", 18.0, 21.0, SprInk, True)
    SubHeading = _SprStyle("SprReportSubHeading", 13.0, 15.5, SprInk, True)
    Body = _SprStyle("SprReportBody", 8.9, 12.2, SprText, False)
    Small = _SprStyle("SprReportSmall", 7.3, 9.2, SprMuted, False)

    def DrawEyebrow(Text: str, X: float, Y: float, Color=SprCyan, Size: float = 8.8):
        Pdf.setFillColor(Color)
        Pdf.setFont(SprFontBold, Size)
        Pdf.drawString(X, Y, Text.upper())

    BlockHeaderSize = 9.4
    BlockHeaderGap = 7.0 * mm

    def DrawBlockHeader(Text: str, X: float, Y: float, W: float, Color=SprCyan, Size: float | None = None):
        HeaderSize = Size or BlockHeaderSize
        Pdf.setFillColor(Color)
        Pdf.setFont(SprFontBold, HeaderSize)
        Pdf.drawCentredString(X + W / 2, Y, _PdfText(Text).upper())

    def DrawCenteredBody(TextValue: Any, X: float, TopY: float, W: float, FontSize: float = 8.8, Leading: float = 10.8, Color=SprText, Bold: bool = False):
        return _SprPara(Pdf, TextValue, X, TopY, W, _SprStyle(f"CenteredBody{str(TextValue)[:12]}", FontSize, Leading, Color, Bold, TA_CENTER))

    def DrawLabelValue(Label: str, Value: Any, X: float, Y: float, W: float, H: float, Accent=SprBlue, Fill=colors.white, ValueSize: float = 10.0):
        _SprPanel(Pdf, X, Y, W, H, Fill, colors.HexColor("#DDE8F7"), 11, 0.72)
        Pdf.setFillColor(Accent)
        Pdf.roundRect(X, Y + H - 3.2, W, 3.2, 1.6, fill=1, stroke=0)
        Pdf.setFillColor(Accent)
        Pdf.setFont(SprFontBold, 7.1)
        Pdf.drawCentredString(X + W / 2, Y + H - 11.6, _PdfText(Label).upper())
        _SprValue(Pdf, Value, X + 8, Y + H - 17.9, W - 16, ValueSize)

    def DrawCenteredLabelValue(Label: str, Value: Any, X: float, Y: float, W: float, H: float, ValueSize: float = 9.4):
        LabelText = _PdfText(Label).upper()
        ValueText = _PdfText(Value)
        Fitted = _SprFittedFontSize(Pdf, ValueText, W - 10, ValueSize, 6.6, SprFontBold)
        ValueStyle = _SprStyle(f"Centered{LabelText}", Fitted, Fitted + 2.2, SprInk, True, TA_CENTER)
        ValuePara = Paragraph(_SprEsc(ValueText), ValueStyle)
        _, ValueHeight = ValuePara.wrap(W - 10, H)
        LabelSize = 6.4
        GapY = 3.8
        TotalHeight = LabelSize + GapY + ValueHeight
        GroupBottomY = Y + max(0, (H - TotalHeight) / 2) - 0.4
        LabelBaselineY = GroupBottomY + ValueHeight + GapY
        Pdf.setFillColor(SprMuted)
        Pdf.setFont(SprFontBold, LabelSize)
        Pdf.drawCentredString(X + W / 2, LabelBaselineY, LabelText)
        ValuePara.drawOn(Pdf, X + 5, GroupBottomY)

    def DrawSoftMetric(Label: str, Value: Any, X: float, Y: float, W: float, H: float, Accent=SprBlue):
        _SprPanel(Pdf, X, Y, W, H, colors.white, colors.HexColor("#DDE8F7"), 12, 0.70)
        Pdf.setFillColor(colors.Color(0.96, 0.98, 1.0, alpha=0.92))
        Pdf.roundRect(X + 5, Y + 5, W - 10, H - 10, 8, fill=1, stroke=0)
        Pdf.setFillColor(Accent)
        Pdf.roundRect(X + 5, Y + H - 8, W - 10, 3.2, 1.6, fill=1, stroke=0)
        _SprLabel(Pdf, Label, X + 10, Y + H - 17, 6.2)
        _SprValue(Pdf, Value, X + 10, Y + H - 23.4, W - 20, 10.6)

    def DrawHero():
        HeaderY = 218 * mm
        HeaderH = 63 * mm
        _SprPanel(Pdf, L, HeaderY, CW, HeaderH, colors.HexColor("#EAFEFF"), colors.HexColor("#BEEFFF"), 23, 0.95)
        Pdf.saveState()
        Pdf.setFillColor(colors.Color(0.70, 0.94, 1.0, alpha=0.45))
        Pdf.circle(R - 20 * mm, HeaderY + HeaderH - 2 * mm, 33 * mm, fill=1, stroke=0)
        Pdf.setFillColor(colors.Color(0.78, 0.70, 1.0, alpha=0.25))
        Pdf.circle(L + 106 * mm, HeaderY + 8 * mm, 21 * mm, fill=1, stroke=0)
        Pdf.setFillColor(colors.white)
        Pdf.roundRect(L + 7 * mm, HeaderY + 7 * mm, CW - 14 * mm, HeaderH - 14 * mm, 19, fill=1, stroke=0)
        Pdf.restoreState()
        _SprLogo(Pdf, LogoPath, L + 13 * mm, HeaderY + HeaderH - 29 * mm, 70 * mm, 27 * mm, True)
        DrawEyebrow("Official Student Progress Record", L + 14 * mm, HeaderY + 25.0 * mm, SprCyan, 7.8)
        Pdf.setFillColor(SprInk)
        Pdf.setFont(SprFontBold, 20.2)
        Pdf.drawString(L + 14 * mm, HeaderY + 17.0 * mm, "Student Progress Report")
        Pdf.setFillColor(SprMuted)
        Pdf.setFont(SprFontRegular, 8.1)
        Pdf.drawString(L + 14 * mm, HeaderY + 9.5 * mm, f"Completion Summary For {ReportModuleName} • {ReportLevel}")
        BadgeW = 52 * mm
        _SprPanel(Pdf, R - BadgeW - 9, HeaderY + HeaderH - 27 * mm, BadgeW, 18 * mm, colors.white, colors.HexColor("#DAE8F6"), 10, 0.70)
        _SprLabel(Pdf, "Generated On", R - BadgeW - 1, HeaderY + HeaderH - 16.4 * mm, 6.2)
        _SprValue(Pdf, GeneratedOn, R - BadgeW - 1, HeaderY + HeaderH - 20.2 * mm, BadgeW - 14, 7.9)
        _SprPanel(Pdf, R - BadgeW - 9, HeaderY + 12 * mm, BadgeW, 19 * mm, colors.white, colors.HexColor("#DAE8F6"), 10, 0.70)
        _SprLabel(Pdf, "Student Code", R - BadgeW - 1, HeaderY + 25.9 * mm, 6.2)
        _SprValue(Pdf, StudentCode, R - BadgeW - 1, HeaderY + 21.8 * mm, BadgeW - 14, 9.2)

    def DrawStudentStrip():
        StripY = 188 * mm
        StripH = 24 * mm
        _SprPanel(Pdf, L, StripY, CW, StripH, colors.white, colors.HexColor("#DDE8F7"), 13, 0.85)
        InnerX = L + 8
        InnerW = CW - 16
        ColW = [48 * mm, 31 * mm, 66 * mm, InnerW - 48 * mm - 31 * mm - 66 * mm]
        ColX = [InnerX]
        for Width in ColW[:-1]:
            ColX.append(ColX[-1] + Width)
        Values = [("Student", StudentName), ("Class / Section", ClassSection), ("Module", ReportModuleName), ("Completed Level", ReportLevel)]
        Pdf.setStrokeColor(colors.HexColor("#E6EEF8"))
        for Index, (Label, Value) in enumerate(Values):
            if Index > 0:
                Pdf.line(ColX[Index], StripY + 5, ColX[Index], StripY + StripH - 5)
            CellX = ColX[Index] + (4 if Index > 0 else 0)
            CellW = ColW[Index] - (8 if Index > 0 else 4)
            DrawCenteredLabelValue(Label, Value, CellX, StripY, CellW, StripH, 8.5 if Index == 2 else 9.4)

    # Page 1
    _SprBackground(Pdf, 1)
    DrawHero()
    DrawStudentStrip()

    SummaryY = 121 * mm
    SummaryH = 60 * mm
    _SprPanel(Pdf, L, SummaryY, CW, SummaryH, colors.white, colors.HexColor("#D9E8F7"), 16, 0.85)
    LeftSummaryW = CW - 62 * mm
    DrawBlockHeader("Level Completion Summary", L + 12, SummaryY + SummaryH - 8.4 * mm, LeftSummaryW, SprCyan)
    CenterHeadingStyle = _SprStyle("CompletionHeading", 15.8, 18.2, SprInk, True, TA_CENTER)
    CenterBodyStyle = _SprStyle("CompletionBody", 8.3, 10.2, SprText, False, TA_CENTER)
    # Uniform Level Completion Summary rhythm:
    # block header -> equal breathing space -> sub-heading -> equal breathing space
    # -> body copy -> equal breathing space -> evidence blocks.
    HeadingTop = SummaryY + SummaryH - 39.5
    _SprPara(Pdf, "Completed Level Performance", L + 12, HeadingTop, LeftSummaryW, CenterHeadingStyle)
    BodyTop = SummaryY + SummaryH - 69.5
    CompletionMessage = Message
    if AssessmentScore and AssessmentScore != "-":
        CompletionMessage = CompletionMessage.replace(AssessmentScore, AssessmentScore.replace(" / ", " / "))
    _SprPara(Pdf, CompletionMessage, L + 18, BodyTop, LeftSummaryW - 12, CenterBodyStyle)
    EvidenceH = 13 * mm
    EvidenceY = SummaryY + 10.0 * mm
    EvidenceW = 36 * mm
    EvidenceGap = 7 * mm
    EvidenceX = L + 12 + (LeftSummaryW - (EvidenceW * 2 + EvidenceGap)) / 2
    _SprPanel(Pdf, EvidenceX, EvidenceY, EvidenceW, EvidenceH, colors.HexColor("#F8FBFF"), colors.HexColor("#E4EDF8"), 8, 0.55)
    DrawCenteredLabelValue("Completed Level", ReportLevel, EvidenceX, EvidenceY, EvidenceW, EvidenceH, 8.8)
    _SprPanel(Pdf, EvidenceX + EvidenceW + EvidenceGap, EvidenceY, EvidenceW, EvidenceH, colors.HexColor("#F8FBFF"), colors.HexColor("#E4EDF8"), 8, 0.55)
    DrawCenteredLabelValue("Next Level", NextLevel, EvidenceX + EvidenceW + EvidenceGap, EvidenceY, EvidenceW, EvidenceH, 8.8)
    ScorePanelX = R - 56 * mm
    ScorePanelY = SummaryY + 8 * mm
    ScorePanelH = SummaryH - 16 * mm
    ScorePanelW = 48 * mm
    _SprPanel(Pdf, ScorePanelX, ScorePanelY, ScorePanelW, ScorePanelH, colors.HexColor("#F9FCFF"), colors.HexColor("#DDE8F7"), 13, 0.65)
    DrawBlockHeader("Assessment Score", ScorePanelX, ScorePanelY + ScorePanelH - 7.0 * mm, ScorePanelW, SprCyan, 8.4)
    _SprScoreDonut(Pdf, ScorePanelX + ScorePanelW / 2, ScorePanelY + 20.2 * mm, AssessmentScore, AssessmentPercentage)
    _SprDrawStatusPill(Pdf, AssessmentResult, ScorePanelX + 5 * mm, ScorePanelY + 4.5 * mm, 38 * mm, PillFill, AccentColor)

    CardY = 76 * mm
    Gap = 5 * mm
    CardW = (CW - Gap) / 2
    CardH = 18 * mm
    DrawLabelValue("Assessment", AssessmentName, L, CardY + CardH + 5 * mm, CardW, CardH, SprBlue)
    DrawLabelValue("Assessment Date", AssessmentDate, L + CardW + Gap, CardY + CardH + 5 * mm, CardW, CardH, SprTeal)
    DrawLabelValue("Practice Completed", PracticeProgress, L, CardY, CardW, CardH, SprPurple)
    DrawLabelValue("Practice Accuracy", PracticeAccuracy, L + CardW + Gap, CardY, CardW, CardH, SprGreen)

    NextY = 48 * mm
    NextH = 21 * mm
    _SprPanel(Pdf, L, NextY, CW, NextH, colors.HexColor("#FFF7ED"), colors.HexColor("#FED7AA"), 13, 0.8)
    DrawBlockHeader("Next Learning Step", L, NextY + NextH - 7.3 * mm, CW, SprAmber, 8.2)
    _SprPara(Pdf, f"{NextStep} • {NextLevelName}", L + 12, NextY + NextH - 14.4 * mm, CW - 24, _SprStyle("SprNext", 10.2, 12.2, SprInk, True, TA_CENTER))

    TakeawayY = 20 * mm
    TakeawayH = 24 * mm
    _SprPanel(Pdf, L, TakeawayY, CW, TakeawayH, colors.HexColor("#F0FDFA"), colors.HexColor("#BFEDE6"), 13, 0.8)
    DrawBlockHeader("Parent Takeaway", L, TakeawayY + TakeawayH - 7.3 * mm, CW, SprTeal, 8.2)
    TakeawayText = DynamicCopy["takeaway"]
    _SprPara(Pdf, TakeawayText, L + 12, TakeawayY + TakeawayH - 14.4 * mm, CW - 24, _SprStyle("SprTakeaway", 8.6, 10.4, SprText, False, TA_CENTER))
    _SprFooter(Pdf, 1, ReportLevel)
    Pdf.showPage()

    # Page 2
    _SprBackground(Pdf, 2)
    _SprHeaderMini(Pdf, LogoPath, "Student Progress Report", StudentCode, GeneratedOn)
    Top = PageH - 42 * mm
    DrawEyebrow("Detailed Review", L, Top, SprCyan, 9.8)
    _SprPara(Pdf, f"Performance Review For {ReportLevel}", L, Top - 6.0, CW, _SprStyle("SprReportHeadingBig", 20.0, 23.0, SprInk, True))

    PanelTop = Top - 22 * mm
    PanelH = 54 * mm
    LeftW = 84 * mm
    Gap = 6 * mm
    RightW = CW - LeftW - Gap
    LeftY = PanelTop - PanelH
    _SprPanel(Pdf, L, LeftY, LeftW, PanelH, colors.white, colors.HexColor("#DDE8F7"), 14, 0.85)
    Pdf.setFillColor(SprInk)
    Pdf.setFont(SprFontBold, 16.3)
    Pdf.drawCentredString(L + LeftW / 2, LeftY + PanelH - 16, "Assessment Performance")
    DrawSoftMetric("Score", AssessmentScore, L + 12, LeftY + PanelH - 32 * mm, 34 * mm, 16 * mm, AccentColor)
    DrawSoftMetric("Percentage", AssessmentPercentage, L + 50 * mm, LeftY + PanelH - 32 * mm, 27 * mm, 16 * mm, AccentColor)
    _SprLabel(Pdf, "Assessment Name", L + 12, LeftY + 16 * mm, 6.4)
    _SprValue(Pdf, AssessmentName, L + 12, LeftY + 11.4 * mm, LeftW - 24, 9.3)

    RightX = L + LeftW + Gap
    _SprPanel(Pdf, RightX, LeftY, RightW, PanelH, colors.HexColor("#F0FDFA"), colors.HexColor("#BFEDE6"), 14, 0.85)
    Pdf.setFillColor(SprInk)
    Pdf.setFont(SprFontBold, 16.3)
    Pdf.drawCentredString(RightX + RightW / 2, LeftY + PanelH - 16, "Practice Review")
    PracticeCardGap = 4 * mm
    PracticeCardW = (RightW - 24 - PracticeCardGap) / 2
    DrawSoftMetric("Practice Sheets", PracticeProgress, RightX + 12, LeftY + 21 * mm, PracticeCardW, 18 * mm, SprPurple)
    DrawSoftMetric("Accuracy", PracticeAccuracy, RightX + 12 + PracticeCardW + PracticeCardGap, LeftY + 21 * mm, PracticeCardW, 18 * mm, SprGreen)
    _SprPara(Pdf, f"Practice performance recorded for the completed level {ReportLevel}.", RightX + 12, LeftY + 13 * mm, RightW - 24, Small)

    MovementY = LeftY - 43 * mm
    MovementH = 36 * mm
    _SprPanel(Pdf, L, MovementY, CW, MovementH, colors.white, colors.HexColor("#DDE8F7"), 14, 0.85)
    # Uniform internal spacing: top padding, centered header, clean gap, subtitle, then table.
    Pdf.setFillColor(SprInk)
    Pdf.setFont(SprFontBold, 16.0)
    MovementTop = MovementY + MovementH
    Pdf.drawCentredString(L + CW / 2, MovementTop - 19, "Level Progression")
    Pdf.setFillColor(SprMuted)
    Pdf.setFont(SprFontRegular, 8.3)
    Pdf.drawCentredString(L + CW / 2, MovementTop - 38, "Completed level and next learning level recorded for this progress report.")
    TableX = L + 10
    TableW = CW - 20
    HeaderY = MovementY + 13.0 * mm
    Pdf.setFillColor(SprInk)
    Pdf.roundRect(TableX, HeaderY, TableW, 12, 6, fill=1, stroke=0)
    Cols = [28 * mm, 28 * mm, 56 * mm, 28 * mm, TableW - 28 * mm - 28 * mm - 56 * mm - 28 * mm]
    ColX = [TableX + 4]
    for Cw in Cols[:-1]:
        ColX.append(ColX[-1] + Cw)
    Pdf.setFillColor(colors.white)
    Pdf.setFont(SprFontBold, 6.3)
    for Index, Head in enumerate(["From", "To", "Assessment", "Score", "Date"]):
        Pdf.drawString(ColX[Index], HeaderY + 4, Head.upper())
    RowY = HeaderY - 24
    RowHeight = 22
    Pdf.setFillColor(colors.HexColor("#F4F8FF"))
    Pdf.roundRect(TableX, RowY, TableW, RowHeight, 6, fill=1, stroke=0)
    Move = Movements[0] if Movements else {"fromLevel": ReportLevel, "toLevel": NextLevel, "assessment": AssessmentName, "score": AssessmentScore, "date": AssessmentDate}
    Values = [Move.get("fromLevel", ReportLevel), Move.get("toLevel", NextLevel), Move.get("assessment", AssessmentName), Move.get("score", AssessmentScore), Move.get("date", AssessmentDate)]
    for Index, Value in enumerate(Values):
        _SprPara(Pdf, Value, ColX[Index], RowY + RowHeight - 5, Cols[Index] - 6, _SprStyle(f"SprMove{Index}", 7.1, 8.3, SprInk if Index in {0, 1, 3} else SprText, Index in {0, 1, 3}))

    # Use the otherwise wasted vertical space below Level Progression to give Parent Guidance
    # a clear, structured, non-cluttered hierarchy.
    GuidanceY = 24 * mm
    GuidanceH = 104 * mm
    _SprPanel(Pdf, L, GuidanceY, CW, GuidanceH, colors.HexColor("#F5F3FF"), colors.HexColor("#DED6FE"), 15, 0.85)
    GuidanceTop = GuidanceY + GuidanceH
    DrawBlockHeader("Parent Guidance", L, GuidanceTop - 20, CW, SprPurple, 9.4)

    Pdf.setFillColor(SprInk)
    Pdf.setFont(SprFontBold, 15.2)
    Pdf.drawCentredString(L + CW / 2, GuidanceTop - 47, "How To Support The Next Step")

    IntroText = DynamicCopy["intro"]
    DrawCenteredBody(IntroText, L + 20, GuidanceTop - 67, CW - 40, 8.3, 10.2, SprMuted, False)

    InnerH = 27.0 * mm
    InnerGap = 4 * mm
    InnerW = (CW - 24 - InnerGap * 2) / 3
    InnerY = GuidanceY + 39.5 * mm
    GuidanceCards = [
        ("Celebrate", DynamicCopy["celebrate"]),
        ("Next Focus", DynamicCopy["nextFocus"]),
        ("At Home", DynamicCopy["atHome"]),
    ]
    for Index, (Label, Text) in enumerate(GuidanceCards):
        X = L + 12 + Index * (InnerW + InnerGap)
        _SprPanel(Pdf, X, InnerY, InnerW, InnerH, colors.white, colors.HexColor("#E8E2FF"), 10, 0.55)
        CardTop = InnerY + InnerH
        Pdf.setFillColor(SprPurple)
        Pdf.setFont(SprFontBold, 7.3)
        Pdf.drawCentredString(X + InnerW / 2, CardTop - 15.0, _PdfText(Label).upper())
        _SprPara(Pdf, Text, X + 7, CardTop - 33.0, InnerW - 14, _SprStyle(f"Guidance{Index}", 8.0, 9.6, SprText, False, TA_CENTER))

    NoteY = GuidanceY + 8.0 * mm
    NoteH = 22.0 * mm
    _SprPanel(Pdf, L + 12, NoteY, CW - 24, NoteH, colors.Color(1, 1, 1, alpha=0.78), colors.HexColor("#E8E2FF"), 9, 0.45)
    NoteTop = NoteY + NoteH
    Pdf.setFillColor(SprPurple)
    Pdf.setFont(SprFontBold, 7.2)
    Pdf.drawCentredString(L + CW / 2, NoteTop - 15.0, "MATHPATH NOTE")
    NoteText = DynamicCopy["note"]
    _SprPara(Pdf, NoteText, L + 20, NoteTop - 31.0, CW - 40, _SprStyle("SprNote", 8.3, 10.2, SprText, False, TA_CENTER))

    _SprFooter(Pdf, 2, ReportLevel)
    Pdf.save()
    Buffer.seek(0)

    SafeFileName = FileName if FileName.lower().endswith(".pdf") else f"{FileName}.pdf"
    return StreamingResponse(
        Buffer,
        media_type=PDF_MIME,
        headers={"Content-Disposition": f'attachment; filename="{SafeFileName}"'},
    )


def BuildParentProgressPdfBytes(FileName: str, ReportData: dict[str, Any]) -> bytes:
    """Build the finalized parent progress PDF and return raw bytes for email attachments."""
    Response = BuildParentProgressPdfResponse(FileName, ReportData)

    async def _Collect() -> bytes:
        Chunks: list[bytes] = []
        async for Chunk in Response.body_iterator:
            if isinstance(Chunk, bytes):
                Chunks.append(Chunk)
            elif isinstance(Chunk, str):
                Chunks.append(Chunk.encode("utf-8"))
            else:
                Chunks.append(bytes(Chunk))
        return b"".join(Chunks)

    try:
        return asyncio.run(_Collect())
    except RuntimeError:
        Loop = asyncio.new_event_loop()
        try:
            return Loop.run_until_complete(_Collect())
        finally:
            Loop.close()
