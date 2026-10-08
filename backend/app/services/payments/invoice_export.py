"""Invoices as an Excel sheet (Payments Phase 2, 2026-10-08).

Amounts are written as numbers in rupees (two decimals) so the sheet can be
summed and filtered; a totals row at the bottom leaves cancelled invoices out,
as the Invoices screen does."""
from __future__ import annotations

from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

COLUMNS: list[tuple[str, str, int]] = [
    ("Invoice No.", "invoiceNumber", 16),
    ("Invoice Date", "invoiceDate", 13),
    ("Due Date", "dueDate", 13),
    ("Student", "studentName", 26),
    ("Student ID", "studentCode", 13),
    ("Level", "levelCode", 10),
    ("Centre", "centreName", 14),
    ("Fee", "feeName", 26),
    ("Period", "periodLabel", 15),
    ("Taxable (Rs)", "taxablePaise", 13),
    ("CGST (Rs)", "cgstPaise", 11),
    ("SGST (Rs)", "sgstPaise", 11),
    ("Amount (Rs)", "amountPaise", 13),
    ("Paid (Rs)", "paidPaise", 12),
    ("Discount (Rs)", "discountPaise", 13),
    ("Balance (Rs)", "balancePaise", 13),
    ("Status", "statusLabel", 12),
    ("Overdue", "isOverdue", 9),
    ("Cancel Reason", "cancelReason", 28),
]
MONEY_KEYS = {"taxablePaise", "cgstPaise", "sgstPaise", "amountPaise", "paidPaise", "discountPaise", "balancePaise"}


def BuildInvoicesWorkbook(Rows: list[dict[str, Any]]) -> bytes:
    Book = Workbook()
    Sheet = Book.active
    Sheet.title = "Invoices"
    Sheet.append([Title for Title, _, _ in COLUMNS])
    HeaderFill = PatternFill("solid", fgColor="E8EAF6")
    for Index, (_, _, Width) in enumerate(COLUMNS, start=1):
        Cell = Sheet.cell(row=1, column=Index)
        Cell.font = Font(bold=True)
        Cell.fill = HeaderFill
        Cell.alignment = Alignment(vertical="center")
        Sheet.column_dimensions[get_column_letter(Index)].width = Width
    Sheet.freeze_panes = "A2"

    Totals = {Key: 0 for Key in MONEY_KEYS}
    for Row in Rows:
        Values = []
        for _, Key, _ in COLUMNS:
            Value = Row.get(Key)
            if Key in MONEY_KEYS:
                Value = round(int(Value or 0) / 100, 2)
            elif Key == "isOverdue":
                Value = "Yes" if Value else ""
            Values.append(Value if Value is not None else "")
        Sheet.append(Values)
        if Row.get("status") != "CANCELLED":
            for Key in MONEY_KEYS:
                Totals[Key] += int(Row.get(Key) or 0)

    for Index, (_, Key, _) in enumerate(COLUMNS, start=1):
        if Key in MONEY_KEYS:
            for RowIndex in range(2, Sheet.max_row + 1):
                Sheet.cell(row=RowIndex, column=Index).number_format = "#,##0.00"

    if Rows:
        Sheet.append([])
        TotalRow = ["Total (excluding cancelled)"] + [""] * (len(COLUMNS) - 1)
        for Index, (_, Key, _) in enumerate(COLUMNS):
            if Key in MONEY_KEYS:
                TotalRow[Index] = round(Totals[Key] / 100, 2)
        Sheet.append(TotalRow)
        Last = Sheet.max_row
        for Index, (_, Key, _) in enumerate(COLUMNS, start=1):
            Cell = Sheet.cell(row=Last, column=Index)
            Cell.font = Font(bold=True)
            if Key in MONEY_KEYS:
                Cell.number_format = "#,##0.00"

    Buffer = BytesIO()
    Book.save(Buffer)
    return Buffer.getvalue()


# 2026-10-08 (Phase 3): payments received.
PAYMENT_COLUMNS: list[tuple[str, str, int]] = [
    ("Receipt No.", "receiptNumber", 16),
    ("Date", "paymentDate", 12),
    ("Student", "studentName", 26),
    ("Student ID", "studentCode", 13),
    ("Centre", "centreName", 14),
    ("Paid By", "payBy", 20),
    ("Received By", "receivedByName", 20),
    ("Methods", "methodSummary", 30),
    ("References", "references", 26),
    ("Amount (Rs)", "amountPaise", 13),
    ("Discount (Rs)", "discountPaise", 13),
    ("Advance Left (Rs)", "advancePaise", 15),
    ("Invoices", "invoices", 30),
    ("Status", "statusLabel", 11),
    ("Cancel Reason", "cancelReason", 26),
]
PAYMENT_MONEY_KEYS = {"amountPaise", "discountPaise", "advancePaise"}


def BuildPaymentsWorkbook(Rows: list[dict[str, Any]]) -> bytes:
    Book = Workbook()
    Sheet = Book.active
    Sheet.title = "Payments"
    Sheet.append([Title for Title, _, _ in PAYMENT_COLUMNS])
    for Index, (_, _, Width) in enumerate(PAYMENT_COLUMNS, start=1):
        Cell = Sheet.cell(row=1, column=Index)
        Cell.font = Font(bold=True)
        Cell.fill = PatternFill("solid", fgColor="E8EAF6")
        Sheet.column_dimensions[get_column_letter(Index)].width = Width
    Sheet.freeze_panes = "A2"
    Totals = {Key: 0 for Key in PAYMENT_MONEY_KEYS}
    ByMethod: dict[str, int] = {}
    for Row in Rows:
        Values = []
        for _, Key, _ in PAYMENT_COLUMNS:
            if Key in PAYMENT_MONEY_KEYS:
                Values.append(round(int(Row.get(Key) or 0) / 100, 2))
            elif Key == "references":
                Values.append(", ".join(Line["reference"] for Line in Row.get("methods", []) if Line.get("reference")))
            elif Key == "invoices":
                Values.append(", ".join(Row.get("invoiceNumbers") or []))
            else:
                Values.append(Row.get(Key) if Row.get(Key) is not None else "")
        Sheet.append(Values)
        if Row.get("status") == "RECORDED":
            for Key in PAYMENT_MONEY_KEYS:
                Totals[Key] += int(Row.get(Key) or 0)
            for Line in Row.get("methods", []):
                ByMethod[Line["methodLabel"]] = ByMethod.get(Line["methodLabel"], 0) + int(Line["amountPaise"])
    for Index, (_, Key, _) in enumerate(PAYMENT_COLUMNS, start=1):
        if Key in PAYMENT_MONEY_KEYS:
            for RowIndex in range(2, Sheet.max_row + 1):
                Sheet.cell(row=RowIndex, column=Index).number_format = "#,##0.00"
    if Rows:
        Sheet.append([])
        TotalRow = ["Total (excluding cancelled)"] + [""] * (len(PAYMENT_COLUMNS) - 1)
        for Index, (_, Key, _) in enumerate(PAYMENT_COLUMNS):
            if Key in PAYMENT_MONEY_KEYS:
                TotalRow[Index] = round(Totals[Key] / 100, 2)
        Sheet.append(TotalRow)
        Last = Sheet.max_row
        for Index, (_, Key, _) in enumerate(PAYMENT_COLUMNS, start=1):
            Sheet.cell(row=Last, column=Index).font = Font(bold=True)
            if Key in PAYMENT_MONEY_KEYS:
                Sheet.cell(row=Last, column=Index).number_format = "#,##0.00"
        Summary = Book.create_sheet("By Method")
        Summary.append(["Method", "Amount (Rs)"])
        Summary.cell(row=1, column=1).font = Font(bold=True)
        Summary.cell(row=1, column=2).font = Font(bold=True)
        for Method, Paise in sorted(ByMethod.items(), key=lambda Item: -Item[1]):
            Summary.append([Method, round(Paise / 100, 2)])
        Summary.append(["Total", round(sum(ByMethod.values()) / 100, 2)])
        Summary.cell(row=Summary.max_row, column=1).font = Font(bold=True)
        Summary.cell(row=Summary.max_row, column=2).font = Font(bold=True)
        for RowIndex in range(2, Summary.max_row + 1):
            Summary.cell(row=RowIndex, column=2).number_format = "#,##0.00"
        Summary.column_dimensions["A"].width = 18
        Summary.column_dimensions["B"].width = 16
    Buffer = BytesIO()
    Book.save(Buffer)
    return Buffer.getvalue()


# ----------------------------------------------------------------------------
# 2026-10-08 (Phase 4): reports and expenses.
# ----------------------------------------------------------------------------

def _Sheet(Book: Workbook, Title: str, Headers: list[tuple[str, int]], Rows: list[list[Any]], MoneyColumns: set[int], TotalRow: list[Any] | None = None, First: bool = False):
    Sheet = Book.active if First else Book.create_sheet(Title)
    Sheet.title = Title
    Sheet.append([Name for Name, _ in Headers])
    for Index, (_, Width) in enumerate(Headers, start=1):
        Cell = Sheet.cell(row=1, column=Index)
        Cell.font = Font(bold=True)
        Cell.fill = PatternFill("solid", fgColor="E8EAF6")
        Sheet.column_dimensions[get_column_letter(Index)].width = Width
    Sheet.freeze_panes = "A2"
    for Row in Rows:
        Sheet.append(Row)
    if TotalRow is not None and Rows:
        Sheet.append([])
        Sheet.append(TotalRow)
        for Index in range(1, len(Headers) + 1):
            Sheet.cell(row=Sheet.max_row, column=Index).font = Font(bold=True)
    for Index in MoneyColumns:
        for RowIndex in range(2, Sheet.max_row + 1):
            Sheet.cell(row=RowIndex, column=Index).number_format = "#,##0.00"
    return Sheet


def _Rs(Paise: int) -> float:
    return round(int(Paise or 0) / 100, 2)


def BuildCollectionsWorkbook(Report: dict[str, Any], Lines: list[dict[str, Any]]) -> bytes:
    Book = Workbook()
    Methods = [Row["methodLabel"] for Row in Report["byMethod"]]
    Summary = [[Row["methodLabel"], _Rs(Row["paise"])] for Row in Report["byMethod"]]
    _Sheet(Book, "Summary", [("Method", 18), ("Amount (Rs)", 16)], Summary, {2}, ["Total", _Rs(Report["total"]["paise"])], First=True)
    Staff = [[Row["name"], Row["paymentCount"]] + [_Rs(next((M["paise"] for M in Row["byMethod"] if M["methodLabel"] == Method), 0)) for Method in Methods] + [_Rs(Row["paise"])] for Row in Report["byStaff"]]
    _Sheet(Book, "By Staff", [("Received By", 24), ("Payments", 10)] + [(Method, 14) for Method in Methods] + [("Total (Rs)", 14)], Staff, set(range(3, 4 + len(Methods))))
    Days = [[Row["date"], Row["paymentCount"]] + [_Rs(next((M["paise"] for M in Row["byMethod"] if M["methodLabel"] == Method), 0)) for Method in Methods] + [_Rs(Row["paise"])] for Row in Report["byDay"]]
    _Sheet(Book, "Daily", [("Date", 12), ("Payments", 10)] + [(Method, 14) for Method in Methods] + [("Total (Rs)", 14)], Days, set(range(3, 4 + len(Methods))),
           ["Total", Report["paymentCount"]] + [_Rs(Row["paise"]) for Row in Report["byMethod"]] + [_Rs(Report["total"]["paise"])])
    Detail = [[Line["date"], Line["receiptNumber"], Line["studentName"], Line["studentCode"], Line["centreName"] or "", Line["method"], Line["reference"] or "", _Rs(Line["amountPaise"]), Line["receivedBy"] or "", Line["payBy"] or ""] for Line in Lines]
    _Sheet(Book, "Payments", [("Date", 12), ("Receipt No.", 16), ("Student", 26), ("Student ID", 13), ("Centre", 14), ("Method", 13), ("Reference", 22), ("Amount (Rs)", 13), ("Received By", 20), ("Paid By", 20)], Detail, {8},
           ["Total", "", "", "", "", "", "", _Rs(sum(Line["amountPaise"] for Line in Lines)), "", ""])
    Buffer = BytesIO()
    Book.save(Buffer)
    return Buffer.getvalue()


def BuildDuesWorkbook(Report: dict[str, Any]) -> bytes:
    Book = Workbook()
    Students = [
        [Row["studentName"], Row["studentCode"], Row["customId"] or "", Row["parentName"] or "", Row["mobile"] or "", Row["centreName"] or "", Row["levelCode"] or "",
         len(Row["invoices"]), Row["oldestDueDate"] or "", Row["maxDaysOverdue"], Row["bucketLabel"], _Rs(Row["overduePaise"]), _Rs(Row["duePaise"]), _Rs(Row["advancePaise"]),
         "Yes" if Row["isActive"] else "No"]
        for Row in Report["students"]
    ]
    _Sheet(Book, "Students", [("Student", 26), ("Student ID", 13), ("Old ID", 10), ("Parent", 22), ("Mobile", 14), ("Centre", 14), ("Level", 9), ("Invoices", 9),
                              ("Oldest Due", 12), ("Days Overdue", 12), ("Age", 20), ("Overdue (Rs)", 13), ("Total Due (Rs)", 14), ("Advance (Rs)", 13), ("Active", 8)],
           Students, {12, 13, 14}, ["Total", "", "", "", "", "", "", Report["invoiceCount"], "", "", "", _Rs(Report["overdue"]["paise"]), _Rs(Report["total"]["paise"]), "", ""], First=True)
    Invoices = [
        [Row["studentName"], Row["studentCode"], Invoice["invoiceNumber"], Invoice["feeName"], Invoice["periodLabel"] or "", Invoice["invoiceDate"], Invoice["dueDate"] or "",
         Invoice["daysOverdue"], Invoice["bucketLabel"], _Rs(Invoice["balancePaise"])]
        for Row in Report["students"] for Invoice in Row["invoices"]
    ]
    _Sheet(Book, "Invoices", [("Student", 26), ("Student ID", 13), ("Invoice No.", 16), ("Fee", 24), ("Period", 15), ("Invoice Date", 12), ("Due Date", 12), ("Days Overdue", 12), ("Age", 20), ("Due (Rs)", 13)],
           Invoices, {10}, ["Total", "", "", "", "", "", "", "", "", _Rs(Report["total"]["paise"])])
    _Sheet(Book, "By Age", [("Age", 22), ("Due (Rs)", 14)], [[Row["label"], _Rs(Row["paise"])] for Row in Report["buckets"]], {2}, ["Total", _Rs(Report["total"]["paise"])])
    Buffer = BytesIO()
    Book.save(Buffer)
    return Buffer.getvalue()


def BuildExpensesWorkbook(Rows: list[dict[str, Any]]) -> bytes:
    Book = Workbook()
    Live = [Row for Row in Rows if Row["status"] == "RECORDED"]
    Data = [
        [Row["expenseNumber"], Row["expenseDate"], Row["categoryName"], Row["item"], Row["vendor"] or "", Row["billNumber"] or "", Row["centreName"] or "",
         Row["methodSummary"], ", ".join(Line["reference"] for Line in Row["methods"] if Line.get("reference")), _Rs(Row["amountPaise"]), Row["details"] or "", Row["note"] or "",
         Row["statusLabel"], Row["cancelReason"] or "", Row["createdByName"] or ""]
        for Row in Rows
    ]
    _Sheet(Book, "Expenses", [("Expense No.", 14), ("Date", 12), ("Category", 18), ("Item", 28), ("Vendor", 20), ("Bill No.", 12), ("Centre", 14), ("Paid With", 28), ("References", 20),
                              ("Amount (Rs)", 13), ("Details", 30), ("Note", 24), ("Status", 11), ("Cancel Reason", 22), ("Recorded By", 18)],
           Data, {10}, ["Total (excluding cancelled)", "", "", "", "", "", "", "", "", _Rs(sum(Row["amountPaise"] for Row in Live)), "", "", "", "", ""], First=True)
    ByCategory: dict[str, int] = {}
    for Row in Live:
        ByCategory[Row["categoryName"]] = ByCategory.get(Row["categoryName"], 0) + Row["amountPaise"]
    _Sheet(Book, "By Category", [("Category", 22), ("Amount (Rs)", 14)], [[Name, _Rs(Paise)] for Name, Paise in sorted(ByCategory.items(), key=lambda Item: -Item[1])], {2},
           ["Total", _Rs(sum(ByCategory.values()))])
    Buffer = BytesIO()
    Book.save(Buffer)
    return Buffer.getvalue()
