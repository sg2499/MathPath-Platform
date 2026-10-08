"""Money and GST for the payments area (2026-10-08).

Everything is whole paise (int). Decimal is used only to read what an admin
typed; floats are never used for money.

GST is included in the price (the old platform's rule, kept by Shailesh):
  taxable = round_half_up(total / (1 + rate))
  GST     = total - taxable           -> taxable + GST == total, always
  CGST    = round_half_up(GST / 2)
  SGST    = GST - CGST                -> CGST + SGST == GST, always
So every invoice line adds up to the paisa, which the old invoices did not
always do (₹2.00 printed as 1.69 + 0.15 + 0.15 = 1.99).
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from app.core.errors import api_error

# Highest amount accepted for a single fee item or payment: ₹10,00,000.
MAX_AMOUNT_PAISE = 10_00_000 * 100
DEFAULT_GST_RATE_BPS = 1800


def ParseRupeesToPaise(Value, *, FieldLabel: str = "Amount", AllowZero: bool = False) -> int:
    """'1100', '1,100.50', 1100, Decimal('1100.5') -> paise. Rejects blanks,
    negatives, more than 2 decimals and anything over MAX_AMOUNT_PAISE."""
    if Value is None or (isinstance(Value, str) and not Value.strip()):
        api_error(422, "AMOUNT_REQUIRED", f"{FieldLabel} is required.")
    if isinstance(Value, bool):
        api_error(422, "AMOUNT_INVALID", f"{FieldLabel} must be a number.")
    if isinstance(Value, float):
        # A JSON number arrives as float; go through its shortest repr so
        # 1100.1 stays 1100.1 and not 1100.0999999.
        Value = repr(Value)
    Text = str(Value).strip().replace(",", "").replace("₹", "").strip()
    try:
        Amount = Decimal(Text)
    except (InvalidOperation, ValueError):
        api_error(422, "AMOUNT_INVALID", f"{FieldLabel} must be a number, like 1100 or 1100.50.")
    if not Amount.is_finite():
        api_error(422, "AMOUNT_INVALID", f"{FieldLabel} must be a number.")
    if Amount < 0:
        api_error(422, "AMOUNT_NEGATIVE", f"{FieldLabel} cannot be negative.")
    if Amount.as_tuple().exponent < -2:
        api_error(422, "AMOUNT_TOO_PRECISE", f"{FieldLabel} can have at most 2 decimal places.")
    Paise = int((Amount * 100).to_integral_value(rounding=ROUND_HALF_UP))
    if Paise == 0 and not AllowZero:
        api_error(422, "AMOUNT_ZERO", f"{FieldLabel} must be more than ₹0.")
    if Paise > MAX_AMOUNT_PAISE:
        api_error(422, "AMOUNT_TOO_LARGE", f"{FieldLabel} cannot be more than ₹10,00,000.")
    return Paise


def PaiseToRupeesString(Paise: int) -> str:
    """12345 -> '123.45' (for JSON / forms)."""
    Sign = "-" if Paise < 0 else ""
    Paise = abs(int(Paise))
    return f"{Sign}{Paise // 100}.{Paise % 100:02d}"


def FormatIndianRupees(Paise: int) -> str:
    """110000 -> '₹1,100.00'; 10670200 -> '₹1,06,702.00' (Indian grouping)."""
    Sign = "-" if Paise < 0 else ""
    Paise = abs(int(Paise))
    Rupees, Fraction = divmod(Paise, 100)
    Digits = str(Rupees)
    if len(Digits) > 3:
        Head, Tail = Digits[:-3], Digits[-3:]
        Groups = []
        while len(Head) > 2:
            Groups.insert(0, Head[-2:])
            Head = Head[:-2]
        if Head:
            Groups.insert(0, Head)
        Digits = ",".join(Groups + [Tail])
    return f"{Sign}₹{Digits}.{Fraction:02d}"


def _RoundHalfUpDivide(Numerator: int, Denominator: int) -> int:
    """round_half_up(Numerator / Denominator) for non-negative integers."""
    return (2 * Numerator + Denominator) // (2 * Denominator)


def SplitInclusiveGst(TotalPaise: int, RateBps: int = DEFAULT_GST_RATE_BPS, *, GstIncluded: bool = True) -> dict:
    """The tax lines for a price that already includes GST. With GST off,
    the whole amount is taxable and the tax lines are zero."""
    TotalPaise = int(TotalPaise)
    if TotalPaise < 0:
        raise ValueError("TotalPaise cannot be negative")
    if not GstIncluded or RateBps <= 0:
        return {"totalPaise": TotalPaise, "taxablePaise": TotalPaise, "gstPaise": 0, "cgstPaise": 0, "sgstPaise": 0, "rateBps": 0}
    Taxable = _RoundHalfUpDivide(TotalPaise * 10000, 10000 + RateBps)
    Gst = TotalPaise - Taxable
    Cgst = _RoundHalfUpDivide(Gst, 2)
    Sgst = Gst - Cgst
    return {"totalPaise": TotalPaise, "taxablePaise": Taxable, "gstPaise": Gst, "cgstPaise": Cgst, "sgstPaise": Sgst, "rateBps": RateBps}
