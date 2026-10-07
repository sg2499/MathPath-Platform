"""Annual Competition question rules -- 2026-10-07 (Shailesh).

"now we need to make the following changes for the annual competition
question engine for the levels specified below ... these need to be
pristine, accurate and exact without any issues or bugs, non negotiable."

Part 1 generates whole papers with the real collector and checks EVERY sum
of EVERY section against EVERY rule he listed, level by level (the same
checker that was run over 300 papers per level before this shipped).
Part 2 covers the pieces underneath: the abacus bead model, the mixing, the
"never below zero" check, exact quotas, and that the one opt-in key added to
the Master Module engine changes nothing for anyone who does not set it.
"""
from __future__ import annotations

import collections
import itertools
import json
import random
import re
from decimal import Decimal, ROUND_HALF_UP

import pytest
from fastapi import HTTPException

from app.question_engine.mm import MMConfig, GenerateMmQuestionSet
from app.services import annual_competition_paper_generation_service as G
from app.services import annual_competition_question_rules as Q
from app.services.annual_competition_paper_registry import (
    ANNUAL_COMPETITION_LEVEL_REGISTRY as R,
    ANNUAL_COMPETITION_RETIRED_SECTION_TITLES,
)

PAPERS_PER_LEVEL = 6


def digits(n):
    return len(str(abs(int(n))))


def max_run_of(keys):
    return max((len(list(g)) for _, g in itertools.groupby(keys)), default=0)


def dp(text):
    text = str(text)
    return len(text.split(".")[1]) if "." in text else 0


def rows_of(q):
    return Q.SignedRowsOf(q["operands"], q["operators"])


class Faults(list):
    def add(self, cond, msg, q=None):
        if not cond:
            self.append(msg + ((" :: " + json.dumps({k: q[k] for k in ("operands", "operators", "correct_answer")}, default=str)) if q else ""))


def check_bead_section(F, qs, shapes_expected, profile_counts_expected, max_total, direct_only, mix_key, label):
    shape_counts = collections.Counter()
    profile_counts = collections.Counter()
    for q in qs:
        ops = q["operands"]
        F.add(all(isinstance(o, int) for o in ops), f"{label}: non-integer row", q)
        shape = tuple(digits(o) for o in ops)
        shape_counts[shape] += 1
        md = q["metadata"]
        profile_counts[(shape, md.get("annual_bead_profile"))] += 1
        F.add(ops[0] > 0, f"{label}: first row not positive", q)
        ok, trace = Q.TraceBeadSum(ops)
        F.add(ok, f"{label}: a row is not a taught bead move", q)
        used = set().union(*trace) if trace else set()
        prof = Q.BEAD_PROFILES[md["annual_bead_profile"]]
        F.add(used <= prof["allowed"], f"{label}: technique outside profile {md['annual_bead_profile']}", q)
        F.add(prof["required"] <= used, f"{label}: required technique missing", q)
        if direct_only:
            F.add(used <= {"DIRECT"}, f"{label}: not direct", q)
        run = 0
        totals = []
        for i, o in enumerate(ops):
            run += o
            F.add(1 <= run <= max_total, f"{label}: running total {run} outside 1..{max_total}", q)
            F.add(run not in totals, f"{label}: total repeats", q)
            F.add(-o not in ops[:i], f"{label}: a row undoes an earlier row", q)
            F.add(not (abs(o) >= 10 and any(abs(e) == abs(o) for e in ops[:i])), f"{label}: a long row repeats", q)
            totals.append(run)
            if digits(o) >= 3:
                F.add(str(abs(o)).count("0") <= 1, f"{label}: round 3-digit row", q)
        F.add(q["correct_answer"] == sum(ops), f"{label}: wrong answer", q)
        F.add(q["operators"] == ["+" if o >= 0 else "-" for o in ops], f"{label}: operators do not match signs", q)
        F.add(all(o != 0 for o in ops), f"{label}: zero row", q)
        F.add(q["display_type"] == "VERTICAL", f"{label}: display", q)
        opts = q["options"]
        F.add(len(opts) == 4 and sum(1 for o in opts if o["is_correct"]) == 1 and len({o["value"] for o in opts}) == 4, f"{label}: options", q)
    F.add(dict(shape_counts) == shapes_expected, f"{label}: shape counts {dict(shape_counts)} != {shapes_expected}")
    if profile_counts_expected is not None:
        F.add(dict(profile_counts) == profile_counts_expected, f"{label}: profile counts {dict(profile_counts)}")
    F.add(max_run_of([mix_key(q) for q in qs]) <= 2, f"{label}: a pattern runs more than 2 in a row")
    return shape_counts


def split(total, weights):
    exact = [total * w / sum(weights) for w in weights]
    shares = [int(v) for v in exact]
    order = sorted(range(len(weights)), key=lambda i: (-(exact[i] - shares[i]), i))
    for i in order[: total - sum(shares)]:
        shares[i] += 1
    return shares


def pm_expect(total, shapes):
    shape_exp, prof_exp = {}, {}
    for shape, share in zip(shapes, split(total, [1] * len(shapes))):
        shape_exp[tuple(shape)] = share
        for prof, cnt in zip(("DIRECT", "FIVE", "TEN", "ALL"), split(share, [4, 7, 7, 7])):
            if cnt:
                prof_exp[(tuple(shape), prof)] = cnt
    return shape_exp, prof_exp


PM_ABACUS = [[2, 2, 2, 1, 1], [2, 2, 2, 2], [3, 3, 3], [2, 2, 3]]
PM2_VISUAL = [[2, 1, 1], [2, 2, 2, 2], [3, 2, 2], [2, 2, 3, 1]]


def check_multiply_mixed(F, qs, label):
    mult = [q["operands"][1] for q in qs]
    F.add(sorted(collections.Counter(mult).items()) == [(2, 13), (3, 13), (4, 13), (5, 13), (6, 12), (7, 12), (8, 12), (9, 12)], f"{label}: multiplier counts {sorted(collections.Counter(mult).items())}")
    F.add(max_run_of(mult) == 1, f"{label}: same multiplier twice running")
    for q in qs:
        a, b = q["operands"]
        F.add(11 <= a <= 99 and 2 <= b <= 9, f"{label}: out of range", q)
        F.add(q["correct_answer"] == a * b, f"{label}: wrong answer", q)
    # mixed through the paper: every quarter holds at least 6 of the 8 multipliers, incl. something >= 7
    for i in range(0, 100, 25):
        part = set(mult[i:i + 25])
        F.add(len(part) >= 6 and max(part) >= 7, f"{label}: questions {i+1}-{i+25} not mixed: {sorted(part)}")


def check_never_below_zero(F, qs, label):
    for q in qs:
        rows = rows_of(q)
        F.add(rows[0] >= 0, f"{label}: starts negative", q)
        run = Decimal(0)
        for r in rows:
            run += r
            F.add(run >= 0, f"{label}: dips below zero", q)
        F.add(Decimal(str(q["correct_answer"])) == sum(rows), f"{label}: wrong answer", q)


def check_two_decimals(F, qs, label):
    for q in qs:
        for o in q["operands"]:
            F.add(dp(o) == 2, f"{label}: operand not 2 decimals", q)


def digit_pair(q):
    a, b = q["operands"]
    return (len(str(a).replace(".", "").replace("-", "")), len(str(b).replace(".", "").replace("-", "")))


def check_level(level, paper):
    F = Faults()
    cfg = R[level]
    by_sec = collections.defaultdict(list)
    for q in paper:
        by_sec[q["_annual_section_number"]].append(q)
    F.add(sorted(by_sec) == [s["number"] for s in cfg["sections"]], f"sections {sorted(by_sec)}")
    for s in cfg["sections"]:
        F.add(len(by_sec[s["number"]]) == s["questionCount"], f"section {s['number']} has {len(by_sec[s['number']])} questions")
    sigs = [G._QuestionSignature(q) for q in paper]
    F.add(len(set(sigs)) == len(sigs), "duplicate sum in the paper")
    for s in cfg["sections"]:
        pool = cfg["sectionConceptPools"][s["key"]]
        if G.IsAnnualMultiplyDivideSection(pool):
            faults = G.AnnualMultiplyDivideRuleFaults([(q["operands"], q["operators"]) for q in by_sec[s["number"]]])
            F.add(faults["faults"] == 0, f"section {s['number']} multiply/divide rule {faults}")

    S = by_sec
    title = lambda q: q["metadata"]["annualCompetitionConceptTitle"]
    if level in ("YLM-L0", "YLM-L1"):
        def cat(q):
            sh = tuple(digits(o) for o in q["operands"])
            return "S" if sh == (1, 1, 1) else ("D" if sh == (2, 2, 2) else "M")
        exp = {(1, 1, 1): 25, (2, 2, 2): 50, (1, 2, 1): 5, (2, 1, 1): 4, (1, 1, 2): 4, (2, 2, 1): 4, (2, 1, 2): 4, (1, 2, 2): 4}
        check_bead_section(F, S[1], exp, None, 99, True, cat, level)
        F.add(collections.Counter(cat(q) for q in S[1]) == {"S": 25, "M": 25, "D": 50}, "category counts")
        for q in S[1]:
            F.add(len(q["operands"]) == 3, "not 3 rows", q)
    if level == "PM-L1":
        se, pe = pm_expect(100, PM_ABACUS)
        check_bead_section(F, S[1], se, pe, 999, False, lambda q: tuple(digits(o) for o in q["operands"]), "PM-1")
    if level == "PM-L2":
        se, pe = pm_expect(50, PM_ABACUS)
        check_bead_section(F, S[1], se, pe, 999, False, lambda q: tuple(digits(o) for o in q["operands"]), "PM-2 abacus")
        se, pe = pm_expect(50, PM2_VISUAL)
        check_bead_section(F, S[2], se, pe, 999, False, lambda q: tuple(digits(o) for o in q["operands"]), "PM-2 visual")
    if level in ("PM-L1", "PM-L2"):
        for q in S[1] + S.get(2, []):
            F.add(not all(digits(o) == 1 for o in q["operands"]), "all single digit sum", q)
    if level in ("PM-L3", "PM-L4"):
        check_multiply_mixed(F, S[3], level + " multiplication")
        shapes = collections.Counter(tuple(digits(o) for o in q["operands"]) for q in S[2])
        F.add((2, 2) not in shapes, f"{level} visual has 2-digit 2-row sums")
        if level == "PM-L3":
            F.add(dict(shapes) == {(2, 2, 2): 20, (2, 2, 2, 2): 10, (3, 3): 10, (3, 3, 3): 10}, f"PM-3 visual shapes {dict(shapes)}")
    if level == "IM-L1":
        check_never_below_zero(F, S[1], "IM-1 abacus")
        check_never_below_zero(F, S[2], "IM-1 visual")
        check_two_decimals(F, S[1], "IM-1 abacus")
        F.add(collections.Counter(tuple(digits(o) for o in q["operands"]) for q in S[2]) == {(3, 3, 2, 2): 50}, "IM-1 visual shape")
    if level == "IM-L2":
        check_never_below_zero(F, S[2], "IM-2 visual")
        check_two_decimals(F, S[2], "IM-2 visual")
        F.add(collections.Counter(digit_pair(q) for q in S[3]) == {(2, 1): 50, (3, 1): 50}, f"IM-2 multiplication {collections.Counter(digit_pair(q) for q in S[3])}")
        F.add(collections.Counter(digit_pair(q) for q in S[4]) == {(4, 1): 50, (3, 1): 50}, f"IM-2 division {collections.Counter(digit_pair(q) for q in S[4])}")
    if level == "IM-L3":
        F.add(len(paper) == 300, "IM-3 total")
        F.add(collections.Counter(digit_pair(q) for q in S[3]) == {(3, 1): 50, (4, 1): 50}, f"IM-3 multiplication {collections.Counter(digit_pair(q) for q in S[3])}")
        F.add(not any("²" in str(q["operands"]) for q in paper), "IM-3 has squares")
        check_two_decimals(F, S[2], "IM-3 visual")
    if level == "IM-L4":
        F.add(collections.Counter(digit_pair(q) for q in S[3]) == {(2, 2): 100}, f"IM-4 multiplication {collections.Counter(digit_pair(q) for q in S[3])}")
        exp = {"4D / 2D Division": 17, "5D / 2D Division": 17, "3D / 2D Division": 17, "3D / 1D Division With Estimation": 17, "4D / 1D Division With Estimation": 16, "3D / 2D Division With Estimation": 16}
        F.add(collections.Counter(title(q) for q in S[4]) == exp, f"IM-4 division {collections.Counter(title(q) for q in S[4])}")
        for q in S[3] + S[4]:
            F.add(all(dp(o) == 0 for o in q["operands"]), "IM-4 decimal operand", q)
        for q in S[4]:
            a, b = (Decimal(str(o)) for o in q["operands"])
            ans = Decimal(str(q["correct_answer"]))
            t = title(q)
            want = {"4D / 2D Division": (4, 2), "5D / 2D Division": (5, 2), "3D / 2D Division": (3, 2), "3D / 1D Division With Estimation": (3, 1), "4D / 1D Division With Estimation": (4, 1), "3D / 2D Division With Estimation": (3, 2)}[t]
            F.add(digit_pair(q) == want, "IM-4 division digits", q)
            if "Estimation" in t:
                F.add(ans == (a / b).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), "IM-4 estimation answer not 2-decimal rounding", q)
            else:
                F.add(ans * b == a and ans == ans.to_integral_value(), "IM-4 division not exact", q)
        check_two_decimals(F, S[2], "IM-4 visual")
        F.add(len(S[5]) == 50, "IM-4 squares")
    if level in ("MM-L1", "MM-L2"):
        check_two_decimals(F, S[2], level + " decimal visual")
        for q in S[2]:
            rows = rows_of(q)
            F.add(Decimal(str(q["correct_answer"])) == sum(rows), "MM visual answer", q)
    if level == "MM-L1":
        exp = {"3D x 2D Multiplication": 25, "2D x 2D Multiplication": 25, "Decimal Multiplication 4D x 1D": 25, "Decimal Multiplication 5D x 1D": 25}
        F.add(collections.Counter(title(q) for q in S[3]) == exp, f"MM-1 multiplication {collections.Counter(title(q) for q in S[3])}")
        for q in S[3]:
            a, b = q["operands"]
            t = title(q)
            ans = Decimal(str(q["correct_answer"]))
            if t.startswith("Decimal"):
                pat = r"^\d{2}\.\d{2}$" if "4D" in t else r"^\d{3}\.\d{2}$"
                F.add(bool(re.match(pat, str(a))) and bool(re.match(r"^0\.0[2-9]$", str(b))) and str(a)[-1] != "0", "MM-1 decimal multiplication pattern", q)
                F.add(ans == Decimal(str(a)) * Decimal(str(b)), "MM-1 decimal multiplication answer", q)
            else:
                F.add(digit_pair(q) == ((3, 2) if t.startswith("3D") else (2, 2)) and isinstance(a, int) and isinstance(b, int) and ans == a * b, "MM-1 whole multiplication", q)
        exp = {"4D ÷ 2D Division": 25, "5D ÷ 2D Division": 25, "Decimal Division 4D ÷ 1D": 25, "Decimal Division 5D ÷ 1D": 25}
        F.add(collections.Counter(title(q) for q in S[4]) == exp, f"MM-1 division {collections.Counter(title(q) for q in S[4])}")
        for q in S[4]:
            a, b = q["operands"]
            t = title(q)
            ans = Decimal(str(q["correct_answer"]))
            if t.startswith("Decimal"):
                pat = r"^\d{2}\.\d{2}$" if "4D" in t else r"^\d{3}\.\d{2}$"
                F.add(bool(re.match(pat, str(a))) and isinstance(b, int) and 2 <= b <= 9 and str(a)[-1] != "0", "MM-1 decimal division pattern", q)
                F.add(ans * b == Decimal(str(a)) and dp(ans) <= 2 and ans != ans.to_integral_value(), "MM-1 decimal division answer", q)
            else:
                F.add(digit_pair(q) == ((4, 2) if t.startswith("4D") else (5, 2)) and ans * b == a and ans == ans.to_integral_value(), "MM-1 whole division", q)
        exp = {"Add Percentage 4D x 2D": 13, "Add Percentage 3D x 2D": 12, "Less Percentage 4D x 2D": 13, "Less Percentage 3D x 2D": 12}
        F.add(collections.Counter(title(q) for q in S[6]) == exp, f"MM-1 percentage {collections.Counter(title(q) for q in S[6])}")
        for q in S[6]:
            a, b = q["operands"]
            t = title(q)
            ans = Decimal(str(q["correct_answer"]))
            pat = r"^\d{2}\.\d{2}$" if "4D" in t else r"^\d\.\d{2}$"
            F.add(bool(re.match(pat, str(a))) and str(a)[-1] != "0" and str(a)[0] != "0" and isinstance(b, int) and 11 <= b <= 99 and b % 10 != 0, "MM-1 percentage pattern", q)
            base = Decimal(str(a))
            exact = base * b / 100 if t.startswith("Add") else base - base * b / 100
            F.add(ans == exact.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) and ans > 0, "MM-1 percentage answer", q)
            F.add(q["operators"] == ["", "×%" if t.startswith("Add") else "-%"], "MM-1 percentage operator", q)
        F.add(len(S[5]) == 50 and len(S[7]) == 50 and len(S[1]) == 50, "MM-1 untouched sections")
    if level == "MM-L2":
        F.add(collections.Counter(title(q) for q in S[5]) == {"Squares": 25, "Cubes": 25}, f"MM-2 squares/cubes {collections.Counter(title(q) for q in S[5])}")
        F.add(collections.Counter(title(q) for q in S[7]) == {"Square Root": 25, "Cube Root": 25}, f"MM-2 roots {collections.Counter(title(q) for q in S[7])}")
        radicand_digits = collections.Counter()
        for q in S[7]:
            text = str(q["operands"][0])
            ans = int(q["correct_answer"])
            n = int(re.sub(r"\D", "", text))
            if text.startswith("∛"):
                F.add(ans ** 3 == n and 22 <= ans <= 99, "MM-2 cube root", q)
                radicand_digits[len(str(n))] += 1
            else:
                F.add(text.startswith("√") and ans * ans == n, "MM-2 square root", q)
        F.add(dict(radicand_digits) == {5: 13, 6: 12}, f"MM-2 cube root digits {dict(radicand_digits)}")
        for q in S[5]:
            text = str(q["operands"][0])
            base = int(re.sub(r"\D", "", text.split(")")[0]))
            F.add(int(q["correct_answer"]) == (base ** 2 if "²" in text else base ** 3), "MM-2 square/cube answer", q)
    return F


# ---------------------------------------------------------------------------
# Part 1: whole papers, every sum, every rule
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("level", sorted(R))
def test_every_sum_of_every_paper_meets_every_rule(level):
    cfg = R[level]
    for index in range(PAPERS_PER_LEVEL):
        paper = G._CollectAnnualCompetitionQuestions(level, cfg["sections"], cfg["sectionConceptPools"], f"rules-test-{index}")
        faults = check_level(level, paper)
        assert not faults, f"{level} paper {index}: " + " | ".join(faults[:5])


@pytest.mark.parametrize("level", sorted(R))
def test_the_same_paper_seed_always_gives_the_same_paper(level):
    cfg = R[level]
    first = G._CollectAnnualCompetitionQuestions(level, cfg["sections"], cfg["sectionConceptPools"], "same-seed")
    second = G._CollectAnnualCompetitionQuestions(level, cfg["sections"], cfg["sectionConceptPools"], "same-seed")
    assert [G._QuestionSignature(q) for q in first] == [G._QuestionSignature(q) for q in second]


def test_level_totals_after_the_changes():
    totals = {level: (len(cfg["sections"]), sum(s["questionCount"] for s in cfg["sections"]), sum(s["timeLimitSeconds"] for s in cfg["sections"])) for level, cfg in R.items()}
    assert totals == {
        "YLM-L0": (1, 100, 600), "YLM-L1": (1, 100, 600), "PM-L1": (1, 100, 600), "PM-L2": (2, 100, 600),
        "PM-L3": (3, 200, 1200), "PM-L4": (4, 300, 1200), "IM-L1": (4, 300, 1200), "IM-L2": (4, 300, 1200),
        "IM-L3": (4, 300, 1200),  # Squares removed: was (5, 350, 1500)
        "IM-L4": (5, 350, 1500), "MM-L1": (7, 450, 2100), "MM-L2": (7, 450, 2100),
    }


def test_im3_squares_section_is_gone_but_still_named_for_old_attempts():
    assert [s["title"] for s in R["IM-L3"]["sections"]] == [
        "Decimal Add/Less (Abacus)", "Decimal Add/Less (Visual)", "Multiplication (Visual)", "Division (Visual)",
    ]
    assert "SEC5" not in R["IM-L3"]["sectionConceptPools"]
    assert ANNUAL_COMPETITION_RETIRED_SECTION_TITLES["IM-L3"] == {5: "Squares (Visual)"}
    from app.services.annual_competition_practice_report_service import _SectionTitleLookup

    lookup = _SectionTitleLookup("IM-L3")
    assert lookup[5] == "Squares (Visual)" and lookup[4] == "Division (Visual)"
    assert 6 not in _SectionTitleLookup("IM-L4")  # nothing invented for other levels


def test_beginners_and_bloomers_share_one_paper_design():
    assert R["YLM-L0"]["sectionConceptPools"]["SEC1"] is R["YLM-L1"]["sectionConceptPools"]["SEC1"]


# ---------------------------------------------------------------------------
# Part 2a: the abacus bead model
# ---------------------------------------------------------------------------
def _brute_force_direct_add(current, digit):
    """Independent of IsDirectAdd: literally move beads. Lower beads worth 1
    (four of them), one upper bead worth 5."""
    lower, upper = current % 5, current // 5
    need_upper, need_lower = digit // 5, digit % 5
    return upper + need_upper <= 1 and lower + need_lower <= 4


def _brute_force_direct_sub(current, digit):
    lower, upper = current % 5, current // 5
    need_upper, need_lower = digit // 5, digit % 5
    return upper - need_upper >= 0 and lower - need_lower >= 0


def test_direct_move_table_matches_real_bead_movement_for_every_digit_pair():
    for current in range(10):
        for digit in range(1, 10):
            assert Q.IsDirectAdd(current, digit) == _brute_force_direct_add(current, digit), (current, digit)
            assert Q.IsDirectSub(current, digit) == _brute_force_direct_sub(current, digit), (current, digit)


@pytest.mark.parametrize("rows", [
    [5, 2, 2], [9, -5, -2], [3, 10, 5], [12, -1, 7], [12, 55, -50], [22, 15, -27], [50, 40, -60], [31, -21, 27],
])
def test_every_bloomers_example_shailesh_gave_is_a_direct_sum(rows):
    valid, trace = Q.TraceBeadSum(rows)
    assert valid
    assert all(moves == {Q.MOVE_DIRECT} for moves in trace)


@pytest.mark.parametrize("rows,expected", [
    ([4, 1], {Q.MOVE_COMP5}),                      # +5 -4
    ([3, 4], {Q.MOVE_COMP5}),                      # +5 -1
    ([5, -1], {Q.MOVE_COMP5}),                     # -5 +4
    ([6, -3], {Q.MOVE_COMP5}),                     # -5 +2
    ([8, 7], {Q.MOVE_COMP10, Q.MOVE_DIRECT}),      # +10 -3, carry onto an empty rod
    ([9, 1], {Q.MOVE_COMP10, Q.MOVE_DIRECT}),
    ([12, -9], {Q.MOVE_COMP10, Q.MOVE_DIRECT}),    # -10 +1
    ([48, 7], {Q.MOVE_COMP10, Q.MOVE_COMP5}),      # +10 -3, and the carry on a 4 is +5 -4
    ([99, 1], {Q.MOVE_COMP10, Q.MOVE_DIRECT}),     # carry runs through two rods
    ([100, -1], {Q.MOVE_COMP10, Q.MOVE_DIRECT}),   # borrow runs through two rods
    ([50, -1], {Q.MOVE_COMP10, Q.MOVE_COMP5}),     # -10 +9, and the borrow from a 5 is -5 +4
])
def test_bead_moves_are_classified_the_way_they_are_taught(rows, expected):
    valid, trace = Q.TraceBeadSum(rows)
    assert valid and trace[0] == expected


@pytest.mark.parametrize("rows", [[6, 7], [5, 6], [7, 6], [8, 6], [13, -6], [12, -7], [14, -9], [52, -17], [3, -5], [20, -21]])
def test_mixed_friend_moves_and_below_zero_are_refused(rows):
    valid, _trace = Q.TraceBeadSum(rows)
    assert not valid


def test_every_single_rod_move_is_direct_small_friends_big_friends_or_refused():
    """All 180 (digit showing, digit added or taken) pairs: the three taught
    techniques and the refused mixed-friends moves account for every one,
    and each classification is what the beads really need."""
    mixed_add = {(5, 6), (5, 7), (5, 8), (5, 9), (6, 6), (6, 7), (6, 8), (7, 6), (7, 7), (8, 6)}
    mixed_sub = {(1, 6), (2, 6), (2, 7), (3, 6), (3, 7), (3, 8), (4, 6), (4, 7), (4, 8), (4, 9)}
    for current in range(10):
        for digit in range(1, 10):
            add = Q.ClassifyDigitMove(10 + current, 0, digit, 1)  # 10 + current: a rod above to carry onto
            if current + digit <= 9:
                assert add == ({Q.MOVE_DIRECT} if _brute_force_direct_add(current, digit) else {Q.MOVE_COMP5})
            elif (current, digit) in mixed_add:
                assert add is None
            else:
                assert add is not None and Q.MOVE_COMP10 in add
            sub = Q.ClassifyDigitMove(10 + current, 0, digit, -1)
            if current >= digit:
                assert sub == ({Q.MOVE_DIRECT} if _brute_force_direct_sub(current, digit) else {Q.MOVE_COMP5})
            elif (current, digit) in mixed_sub:
                assert sub is None
            else:
                assert sub is not None and Q.MOVE_COMP10 in sub


def test_builder_never_returns_a_sum_its_own_independent_check_rejects():
    for seed in range(400):
        for profile in Q.BEAD_PROFILES:
            for shape in ([2, 2, 2, 1, 1], [2, 2, 2, 2], [3, 3, 3], [2, 2, 3], [2, 1, 1], [3, 2, 2], [2, 2, 3, 1]):
                built = Q.BuildBeadSum(random.Random(f"{seed}-{profile}-{shape}"), shape, profile, 999)
                if built is None:
                    continue
                rows, trace = built
                assert [len(str(abs(r))) for r in rows] == shape
                valid, checked = Q.TraceBeadSum(rows)
                assert valid and checked == trace
                used = set().union(*trace)
                assert used <= Q.BEAD_PROFILES[profile]["allowed"] and Q.BEAD_PROFILES[profile]["required"] <= used


# ---------------------------------------------------------------------------
# Part 2b: mixing
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("counts,max_run", [([25, 25, 50], 2), ([13, 13, 13, 13, 12, 12, 12, 12], 1), ([25, 25, 25, 25], 2), ([13, 13, 12, 12], 2)])
def test_mix_keeps_every_count_and_never_exceeds_the_run_limit(counts, max_run):
    for seed in range(200):
        schedule = [{"title": f"P{index}"} for index, count in enumerate(counts) for _ in range(count)]
        mixed = Q.MixSchedule(schedule, random.Random(seed), max_run)
        assert collections.Counter(e["title"] for e in mixed) == collections.Counter(e["title"] for e in schedule)
        assert max_run_of([e["title"] for e in mixed]) <= max_run


def test_mix_is_the_same_for_the_same_seed_and_differs_between_seeds():
    schedule = [{"title": f"P{index}"} for index in range(4) for _ in range(25)]
    order = lambda seed: [e["title"] for e in Q.MixSchedule(list(schedule), random.Random(seed), 2)]
    assert order(1) == order(1)
    assert order(1) != order(2)


def test_mix_does_its_best_when_the_limit_is_impossible():
    schedule = [{"title": "A"}] * 9 + [{"title": "B"}]
    mixed = Q.MixSchedule(list(schedule), random.Random(3), 2)
    assert collections.Counter(e["title"] for e in mixed) == {"A": 9, "B": 1}


# ---------------------------------------------------------------------------
# Part 2c: "no negative start, no borrowing"
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("operands,operators,expected", [
    (["3.03", "5.52", "8.94", "6.75"], ["", "+", "-", "+"], True),    # 8.55 - 8.94 dips
    ([288, 656, 20, 92], ["", "-", "+", "+"], True),
    (["-3.77", "5.00", "1.00"], ["", "+", "+"], True),                # starts negative
    (["7.43", "4.27", "2.40", "6.26"], ["", "-", "+", "+"], False),
    ([500, 347, 68, 58], ["", "+", "-", "+"], False),
    ([12, -1, 7], ["+", "-", "+"], False),                            # signed-operand convention
    ([12, -13, 7], ["+", "-", "+"], True),
    (["5.00", "5.00"], ["", "-"], False),                             # exactly zero is not below zero
    (["(54)²"], [""], False),                                         # not a stacked sum
])
def test_starts_negative_or_dips_below_zero(operands, operators, expected):
    assert Q.StartsNegativeOrDipsBelowZero(operands, operators) is expected


def test_the_never_below_zero_rule_is_on_exactly_the_sections_asked_for():
    flagged = {
        (level, key)
        for level, cfg in R.items() for key, pool in cfg["sectionConceptPools"].items()
        if any(entry.get("annualNeverBelowZero") for entry in pool)
    }
    assert flagged == {("IM-L1", "SEC1"), ("IM-L1", "SEC2"), ("IM-L2", "SEC2")}
    for level, key in flagged:
        assert all(entry.get("annualNeverBelowZero") for entry in R[level]["sectionConceptPools"][key])


def test_without_the_rule_im1_really_did_start_negative_and_dip(monkeypatch):
    """Guards Part 1 against passing for the wrong reason."""
    monkeypatch.setattr(G, "StartsNegativeOrDipsBelowZero", lambda _operands, _operators: False)
    cfg = R["IM-L1"]
    dips = 0
    for index in range(4):
        paper = G._CollectAnnualCompetitionQuestions("IM-L1", cfg["sections"][:2], cfg["sectionConceptPools"], f"im1-old-{index}")
        dips += sum(1 for q in paper if Q.StartsNegativeOrDipsBelowZero(q["operands"], q["operators"]))
    assert dips >= 20


# ---------------------------------------------------------------------------
# Part 2d: exact quotas, no quiet borrowing
# ---------------------------------------------------------------------------
def test_quotas_are_used_exactly_and_a_wrong_total_stops_generation():
    pool = [{"title": "A", "quota": 3}, {"title": "B", "quota": 1}]
    assert [e["title"] for e in G._OrderedConceptSchedule(pool, 4)] == ["A", "A", "A", "B"]
    with pytest.raises(HTTPException) as error:
        G._OrderedConceptSchedule(pool, 5)
    assert error.value.status_code == 500


def test_a_pool_without_quotas_is_still_split_equally_in_order():
    pool = [{"title": "A"}, {"title": "B"}, {"title": "C"}]
    assert [e["title"] for e in G._OrderedConceptSchedule(pool, 7)] == ["A", "A", "A", "B", "B", "C", "C"]


def test_every_quota_pool_adds_up_to_its_section():
    for level, cfg in R.items():
        for section in cfg["sections"]:
            pool = cfg["sectionConceptPools"][section["key"]]
            if any("quota" in entry for entry in pool):
                assert all("quota" in entry for entry in pool), (level, section["key"])
                assert sum(entry["quota"] for entry in pool) == section["questionCount"], (level, section["key"])
                assert section.get("strictQuotas"), (level, section["key"])


def test_a_strict_section_fails_loudly_instead_of_borrowing_another_pattern(monkeypatch):
    """MM-2's roots used to come out 34 / 16 because the cube-root half ran
    dry and the square roots quietly filled in. In a strict section a
    pattern that cannot be produced stops the paper."""
    real = G._GenerateOneAnnualQuestion

    def no_cube_roots(spec, seed, level):
        return None if spec.get("conceptFamily") == "CUBE_ROOT" else real(spec, seed, level)

    monkeypatch.setattr(G, "_GenerateOneAnnualQuestion", no_cube_roots)
    monkeypatch.setattr(G, "ANNUAL_COMPETITION_STRICT_SLOT_MAX_RETRIES", 5)
    cfg = R["MM-L2"]
    roots = [s for s in cfg["sections"] if s["key"] == "SEC7"]
    with pytest.raises(HTTPException) as error:
        G._CollectAnnualCompetitionQuestions("MM-L2", roots, cfg["sectionConceptPools"], "strict")
    assert error.value.status_code == 400


def test_collector_only_keys_never_reach_a_module_engine():
    for exclude in (G._IM_EXCLUDE, G._MM_EXCLUDE):
        assert {"quota", "mixKey", "conceptTitle", "annualNeverBelowZero"} <= exclude


# ---------------------------------------------------------------------------
# Part 2e: the one opt-in key added to the Master Module engine
# ---------------------------------------------------------------------------
def _mm_decimal_visual(seed, extra):
    config = MMConfig(
        ModuleCode="MM", LevelCode="MM-L1", LessonNumber=5, DpsNumber=1, DpsTitle="Decimal Add-Less (Visual)",
        LessonTitle="Annual Competition", QuestionCount=1, Seed=seed, ConceptFamily="DECIMAL_ADD_LESS",
        OperationFocus="ADD_LESS", DigitPattern="ANNUAL_COMPETITION", Difficulty="MASTER",
        GeneratorConfig={"forceSingleSection": True, "maxWholeDigits": 3, "rowCountCap": 4, **extra},
    )
    return GenerateMmQuestionSet(config)[0]


def test_mm_decimal_places_override_is_opt_in_and_changes_nothing_when_absent():
    for seed in range(40):
        plain = _mm_decimal_visual(f"s{seed}", {})
        assert all(dp(o) == 1 for o in plain["operands"])          # exactly as before
        two = _mm_decimal_visual(f"s{seed}", {"addLessDecimalPlacesOverride": 2})
        assert all(dp(o) == 2 for o in two["operands"])
        assert len(two["operands"]) == len(plain["operands"])       # same rows, only the decimals differ


# ---------------------------------------------------------------------------
# Part 2f: MM-1's own decimal patterns, one question at a time
# ---------------------------------------------------------------------------
def test_mm1_decimal_division_is_always_exact_at_two_decimals():
    for seed in range(500):
        for whole_digits in (2, 3):
            q = Q.BuildDecimalDivisionQuestion({"decimalWholeDigits": whole_digits}, f"d{seed}")
            dividend, divisor = Decimal(q["operands"][0]), q["operands"][1]
            answer = Decimal(q["correct_answer"])
            assert answer * divisor == dividend and dp(answer) <= 2 and 2 <= divisor <= 9


def test_mm1_percentage_answers_are_rounded_half_up_to_two_decimals():
    for seed in range(500):
        for mode in ("ADD_PERCENTAGE", "LESS_PERCENTAGE"):
            q = Q.BuildPercentageQuestion({"decimalWholeDigits": 2, "percentageMode": mode}, f"p{seed}")
            base, percent = Decimal(q["operands"][0]), q["operands"][1]
            exact = base * percent / 100 if mode == "ADD_PERCENTAGE" else base - base * percent / 100
            assert Decimal(q["correct_answer"]) == exact.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def test_shailesh_own_percentage_and_decimal_examples_work_out_as_the_engine_would_mark_them():
    half_up = lambda value: value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    assert half_up(Decimal("97.03") * 29 / 100) == Decimal("28.14")
    assert half_up(Decimal("3.88") * 78 / 100) == Decimal("3.03")
    assert half_up(Decimal("70.37") - Decimal("70.37") * 81 / 100) == Decimal("13.37")
    assert half_up(Decimal("4.47") - Decimal("4.47") * 39 / 100) == Decimal("2.73")
    assert Decimal("24.16") * Decimal("0.04") == Decimal("0.9664")
    assert Decimal("231.15") * Decimal("0.08") == Decimal("18.492")
