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
