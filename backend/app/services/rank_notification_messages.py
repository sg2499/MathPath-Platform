"""Large, hand-written message-pool system for the leaderboard rank-change /
podium-placement notifications (see rank_notification_service.py for the
orchestration that calls into this).

Built per Shailesh's explicit instruction (2026-09-01): "we need to have a
pool of numerous number of messages, lots and lots of them so that the
students never get bored of the same message and almost everytime see a
new message in the notifications." Also explicit: podium messages get
distinct flavor per rank (1st vs 2nd vs 3rd), and wording must differ
between "Overall Journey" and "Specific Exam"/"Specific Level" leaderboards,
and between DPS and Mock activities -- so this file keeps four fully
separate template pools per outcome (DPS_OVERALL / DPS_SPECIFIC /
MOCK_OVERALL / MOCK_SPECIFIC) rather than one generic pool with the scope
name swapped in.

Design
------
STUDENT_MESSAGE_POOLS[(dimension, outcome)] -> list[str] format-templates.

  dimension:
    "DPS_OVERALL"   -- DPS "Overall Journey" (pooled across a whole module)
    "DPS_SPECIFIC"  -- DPS "Specific Level" (pooled within one level)
    "MOCK_OVERALL"  -- Mock "Overall Journey" / cumulative (within one level)
    "MOCK_SPECIFIC" -- Mock "Specific Exam" (one exam)

  outcome -- what happened to the student's rank this submission:
    "PODIUM_1" / "PODIUM_2" / "PODIUM_3"  -- finished in a podium place
    "IMPROVED"   -- rank number went down (better) vs. immediately before
                    this submission
    "DROPPED"    -- rank number went up (worse) vs. immediately before
                    this submission
    "HELD"       -- rank unchanged vs. immediately before this submission
    "FIRST_PLACEMENT" -- no "before" state exists (this is the student's
                    first-ever qualifying result in this exact scope) --
                    there is nothing to compare against, so this drops the
                    up/down framing entirely rather than guessing.

TEACHER_PODIUM_MESSAGE_POOLS[(dimension, rank)] -> list[str], rank in
(1, 2, 3). Teacher notifications only ever fire for podium placements
(Shailesh's explicit choice), never for improved/dropped/held/first.

XP_RANK_PROMOTION_MESSAGES -> list[str], a single pool (XP rank tiers are a
platform-wide progression, not scoped per leaderboard dimension).

Every template is a plain Python str.format() string. Guaranteed fields per
bucket -- see FORMAT_FIELDS below and rank_notification_service.py, which
fills them in:
  scope_name    -- always present. Human name of the scope, e.g.
                    "Prep Module DPS Overall Journey", "Level 3 DPS",
                    "Level 2 Mock Overall Journey", "Fractions Mastery Mock".
  total         -- always present. Total participants in this leaderboard.
  rank          -- always present. The student's rank after this attempt.
  prev_rank     -- IMPROVED / DROPPED / HELD only. Rank before this attempt.
  spots_label   -- IMPROVED / DROPPED only. Pre-pluralized, e.g. "1 spot" /
                    "3 spots" -- never use a bare {spots} int in a template,
                    it reads wrong when the count is 1.

Anti-repeat selection lives in pick_message() at the bottom of this file --
a pure function (pool in, recently-used template ids out, message + id
out) with no DB/session dependency of its own; the caller supplies the
"recently used" set, read from the student's own recent Notification rows
(see rank_notification_service.py).
"""
import random

FORMAT_FIELDS = ("scope_name", "total", "rank", "prev_rank", "spots_label")


# ============================================================================
# DPS Overall Journey (module-pooled practice standing)
# ============================================================================

_DPS_OVERALL_PODIUM_1 = [
    "You're #1 on {scope_name}! Out of {total} students working through this module, nobody's practice record beats yours right now.",
    "Top of the module. Your practice record just put you in 1st place on {scope_name}.",
    "First place, module-wide: {scope_name} now has your name at the very top.",
    "That's the strongest practice record in the module right now -- you lead {scope_name}, ahead of all {total} students in it.",
    "You've topped the whole module's practice standings. #1 on {scope_name}.",
    "Nobody's practice journey through this module is ahead of yours -- you're #1 on {scope_name}.",
    "Your sheets are paying off in the biggest way: 1st place on {scope_name}.",
    "The module's #1 practice spot is yours -- {scope_name} now leads with your name.",
    "Best practice record in the module, full stop. You're leading {scope_name}.",
    "You just became the one to beat across this whole module's practice sheets -- #1 on {scope_name}.",
]

_DPS_OVERALL_PODIUM_2 = [
    "2nd place across the module -- your practice record puts you at #2 on {scope_name}.",
    "So close to the module's top spot: you're #2 on {scope_name} right now.",
    "A strong module-wide showing -- podium finish, 2nd place on {scope_name}.",
    "Your practice sheets have you sitting at #2 on {scope_name}, out of {total} students.",
    "Runner-up across the whole module -- #2 on {scope_name}.",
    "One spot from the top of the module: you're #2 on {scope_name}.",
    "Your consistency through this module has landed you 2nd place on {scope_name}.",
    "Podium finish, module-wide -- #2 on {scope_name} and closing in on the lead.",
    "That's a #2 module ranking on {scope_name} -- right behind the leader.",
    "Silver spot secured across the module's practice standings -- #2 on {scope_name}.",
]

_DPS_OVERALL_PODIUM_3 = [
    "You've cracked the module's top 3 -- #3 on {scope_name}.",
    "Podium finish across the whole module: 3rd place on {scope_name}.",
    "Bronze position in the module's practice standings -- you're #3 on {scope_name}.",
    "Your practice record just broke into the top 3 of the module -- #3 on {scope_name}, out of {total} students.",
    "3rd place, module-wide. {scope_name} has you on the podium.",
    "You're on the podium across this entire module -- #3 on {scope_name}.",
    "Top 3 in the module's practice journey -- currently #3 on {scope_name}.",
    "That's a podium finish on {scope_name}: 3rd place across the whole module.",
    "You just claimed the module's #3 practice spot -- {scope_name}.",
    "Bronze on the module leaderboard -- #3 on {scope_name} and within reach of higher.",
]

_DPS_OVERALL_IMPROVED = [
    "Your module-wide practice standing just climbed {spots_label} -- from #{prev_rank} to #{rank} on {scope_name}.",
    "Nice progress across the module: you're up {spots_label}, now #{rank} on {scope_name}.",
    "That sheet moved the needle module-wide -- #{prev_rank} to #{rank} on {scope_name}.",
    "You're climbing the module standings -- #{rank} on {scope_name} now, {spots_label} better than before.",
    "Your overall practice journey through the module just improved -- {spots_label} gained, now #{rank} on {scope_name}.",
    "Momentum across the module: you've moved up to #{rank} on {scope_name}.",
    "That's forward progress on your whole-module practice record -- {spots_label} up, #{rank} on {scope_name}.",
    "Your module ranking ticked up to #{rank} on {scope_name} -- {spots_label} ahead of where you were.",
    "Solid gain across the module's practice standings -- you're now #{rank} on {scope_name}.",
    "Every sheet counts toward the module total, and it shows: {spots_label} up, #{rank} on {scope_name}.",
]

_DPS_OVERALL_DROPPED = [
    "Your module-wide practice standing eased back {spots_label} -- now #{rank} on {scope_name}, down from #{prev_rank}.",
    "This one cost you {spots_label} in the module standings -- currently #{rank} on {scope_name}.",
    "You're now #{rank} on {scope_name}, {spots_label} lower than before. Plenty of module left to climb back through.",
    "A step back across the module's practice record -- {spots_label} down, now #{rank} on {scope_name}.",
    "Your overall module ranking slipped to #{rank} on {scope_name} -- {spots_label} behind your last position.",
    "Not your strongest sheet this time -- #{rank} on {scope_name} now, down {spots_label}.",
    "The module standings shifted under you: #{prev_rank} to #{rank} on {scope_name}.",
    "You've dropped to #{rank} on {scope_name} across the module. One strong sheet can close that gap again.",
    "Module rank check: #{rank} on {scope_name} now, {spots_label} down from where you were.",
    "That sheet pulled your module average down a bit -- #{rank} on {scope_name}, {spots_label} lower.",
]

_DPS_OVERALL_HELD = [
    "Steady across the whole module -- you're still #{rank} on {scope_name}.",
    "No change in your module-wide practice standing: holding #{rank} on {scope_name}.",
    "You defended your module ranking -- still #{rank} on {scope_name}.",
    "Consistent practice keeps you right at #{rank} on {scope_name} across the module.",
    "Same spot in the module standings -- #{rank} on {scope_name}, unchanged.",
    "You held the line module-wide -- #{rank} on {scope_name}.",
    "Your overall module position stayed put: #{rank} on {scope_name}.",
    "Still sitting at #{rank} on {scope_name} across the module -- steady practice holds its ground.",
    "No movement in the module standings this time -- #{rank} on {scope_name}, right where you left it.",
    "You're holding firm at #{rank} on {scope_name} across the whole module.",
]

_DPS_OVERALL_FIRST = [
    "You're officially on the module's practice leaderboard! Your first qualifying sheet puts you at #{rank} on {scope_name}.",
    "Welcome to {scope_name} -- you've entered the module standings at #{rank}, out of {total} students.",
    "Your module-wide practice journey just began -- starting rank: #{rank} on {scope_name}.",
    "First entry logged on the module's practice leaderboard -- you're #{rank} on {scope_name}.",
    "That's your first ranked result across the module: #{rank} on {scope_name}, out of {total}.",
    "You're on the module's practice map now -- #{rank} on {scope_name} to start.",
    "New arrival on {scope_name} -- you've debuted at #{rank} across the whole module.",
    "Your first appearance on the module's practice standings: #{rank} on {scope_name}. Every climb starts somewhere.",
    "You've joined {scope_name} at #{rank} -- now the module-wide climb begins.",
    "Fresh on the module leaderboard: #{rank} on {scope_name}, your very first pooled practice result here.",
]


# ============================================================================
# DPS Specific Level (single-level practice standing)
# ============================================================================

_DPS_SPECIFIC_PODIUM_1 = [
    "You're #1 on {scope_name}! Nobody in this level's practice sheets is ahead of you right now.",
    "Top of the level. Your sheet just put you in 1st place on {scope_name}.",
    "First place at this level: {scope_name} now has your name at the top, out of {total} students.",
    "Strongest practice record at this level right now -- you lead {scope_name}.",
    "You've topped this level's practice standings. #1 on {scope_name}.",
    "Nobody at this level is ahead of your sheets -- #1 on {scope_name}.",
    "Your work at this level is paying off in the biggest way: 1st place on {scope_name}.",
    "The level's #1 practice spot is yours -- {scope_name} now leads with your name.",
    "Best practice record at this level, full stop. You're leading {scope_name}.",
    "You're now the one to beat at this level's practice sheets -- #1 on {scope_name}.",
]

_DPS_SPECIFIC_PODIUM_2 = [
    "2nd place at this level -- your sheet puts you at #2 on {scope_name}.",
    "So close to the top of this level: you're #2 on {scope_name} right now.",
    "A strong showing at this level -- podium finish, 2nd place on {scope_name}.",
    "Your practice sheets have you sitting at #2 on {scope_name}, out of {total} students.",
    "Runner-up at this level -- #2 on {scope_name}.",
    "One spot from the top of this level: you're #2 on {scope_name}.",
    "Your consistency at this level has landed you 2nd place on {scope_name}.",
    "Podium finish at this level -- #2 on {scope_name} and closing in on the lead.",
    "That's a #2 ranking at this level on {scope_name} -- right behind the leader.",
    "Silver spot secured at this level's practice standings -- #2 on {scope_name}.",
]

_DPS_SPECIFIC_PODIUM_3 = [
    "You've cracked this level's top 3 -- #3 on {scope_name}.",
    "Podium finish at this level: 3rd place on {scope_name}.",
    "Bronze position at this level's practice standings -- you're #3 on {scope_name}.",
    "Your sheet just broke into this level's top 3 -- #3 on {scope_name}, out of {total} students.",
    "3rd place at this level. {scope_name} has you on the podium.",
    "You're on the podium at this level -- #3 on {scope_name}.",
    "Top 3 at this level's practice standings -- currently #3 on {scope_name}.",
    "That's a podium finish on {scope_name}: 3rd place at this level.",
    "You just claimed this level's #3 practice spot -- {scope_name}.",
    "Bronze at this level -- #3 on {scope_name} and within reach of higher.",
]

_DPS_SPECIFIC_IMPROVED = [
    "Your standing at this level just climbed {spots_label} -- from #{prev_rank} to #{rank} on {scope_name}.",
    "Nice progress at this level: you're up {spots_label}, now #{rank} on {scope_name}.",
    "That sheet moved the needle at this level -- #{prev_rank} to #{rank} on {scope_name}.",
    "You're climbing this level's standings -- #{rank} on {scope_name} now, {spots_label} better than before.",
    "Your practice record at this level just improved -- {spots_label} gained, now #{rank} on {scope_name}.",
    "Momentum at this level: you've moved up to #{rank} on {scope_name}.",
    "That's forward progress at this level -- {spots_label} up, #{rank} on {scope_name}.",
    "Your level ranking ticked up to #{rank} on {scope_name} -- {spots_label} ahead of where you were.",
    "Solid gain at this level's practice standings -- you're now #{rank} on {scope_name}.",
    "Every sheet at this level counts, and it shows: {spots_label} up, #{rank} on {scope_name}.",
]

_DPS_SPECIFIC_DROPPED = [
    "Your standing at this level eased back {spots_label} -- now #{rank} on {scope_name}, down from #{prev_rank}.",
    "This one cost you {spots_label} at this level -- currently #{rank} on {scope_name}.",
    "You're now #{rank} on {scope_name}, {spots_label} lower than before. Plenty of this level's board left to climb back through.",
    "A step back at this level's practice record -- {spots_label} down, now #{rank} on {scope_name}.",
    "Your ranking at this level slipped to #{rank} on {scope_name} -- {spots_label} behind your last position.",
    "Not your strongest sheet this time -- #{rank} on {scope_name} now, down {spots_label}.",
    "This level's standings shifted under you: #{prev_rank} to #{rank} on {scope_name}.",
    "You've dropped to #{rank} on {scope_name} at this level. One strong sheet can close that gap again.",
    "Level rank check: #{rank} on {scope_name} now, {spots_label} down from where you were.",
    "That sheet pulled your level average down a bit -- #{rank} on {scope_name}, {spots_label} lower.",
]

_DPS_SPECIFIC_HELD = [
    "Steady at this level -- you're still #{rank} on {scope_name}.",
    "No change at this level's practice standing: holding #{rank} on {scope_name}.",
    "You defended your ranking at this level -- still #{rank} on {scope_name}.",
    "Consistent practice keeps you right at #{rank} on {scope_name} at this level.",
    "Same spot at this level -- #{rank} on {scope_name}, unchanged.",
    "You held the line at this level -- #{rank} on {scope_name}.",
    "Your position at this level stayed put: #{rank} on {scope_name}.",
    "Still sitting at #{rank} on {scope_name} at this level -- steady practice holds its ground.",
    "No movement at this level this time -- #{rank} on {scope_name}, right where you left it.",
    "You're holding firm at #{rank} on {scope_name} at this level.",
]

_DPS_SPECIFIC_FIRST = [
    "You're officially on this level's practice leaderboard! Your first qualifying sheet puts you at #{rank} on {scope_name}.",
    "Welcome to {scope_name} -- you've entered this level's standings at #{rank}, out of {total} students.",
    "Your practice journey at this level just began -- starting rank: #{rank} on {scope_name}.",
    "First entry logged at this level's practice leaderboard -- you're #{rank} on {scope_name}.",
    "That's your first ranked result at this level: #{rank} on {scope_name}, out of {total}.",
    "You're on this level's practice map now -- #{rank} on {scope_name} to start.",
    "New arrival on {scope_name} -- you've debuted at #{rank} at this level.",
    "Your first appearance on this level's practice standings: #{rank} on {scope_name}. Every climb starts somewhere.",
    "You've joined {scope_name} at #{rank} -- now the climb through this level begins.",
    "Fresh on this level's leaderboard: #{rank} on {scope_name}, your very first ranked practice result here.",
]


# ============================================================================
# Mock Overall Journey (level-pooled cumulative mock standing)
# ============================================================================

_MOCK_OVERALL_PODIUM_1 = [
    "You're #1 on {scope_name}! Across every mock exam at this level, nobody's cumulative score beats yours right now.",
    "Top of the leaderboard, cumulative across every mock: 1st place on {scope_name}.",
    "First place in your overall mock standing at this level -- {scope_name} now has your name at the top.",
    "The strongest cumulative mock record at this level is yours -- you lead {scope_name}, ahead of all {total} students.",
    "You've topped the level's entire mock journey. #1 on {scope_name}.",
    "Nobody's overall mock performance at this level is ahead of yours -- #1 on {scope_name}.",
    "Every mock exam adds up, and yours added up to the top: 1st place on {scope_name}.",
    "The level's #1 cumulative mock spot is yours -- {scope_name} now leads with your name.",
    "Best overall mock record at this level, full stop. You're leading {scope_name}.",
    "You're now the one to beat across this level's whole mock exam journey -- #1 on {scope_name}.",
]

_MOCK_OVERALL_PODIUM_2 = [
    "2nd place across every mock at this level -- your cumulative score puts you at #2 on {scope_name}.",
    "So close to the top of your overall mock journey: you're #2 on {scope_name}.",
    "A strong cumulative showing -- podium finish, 2nd place on {scope_name}.",
    "Your combined mock scores at this level have you sitting at #2 on {scope_name}, out of {total} students.",
    "Runner-up across the level's whole mock journey -- #2 on {scope_name}.",
    "One spot from the top of your cumulative mock standing: #2 on {scope_name}.",
    "Your consistency across every mock at this level has landed you 2nd place on {scope_name}.",
    "Podium finish, cumulative -- #2 on {scope_name} and closing in on the lead.",
    "That's a #2 overall mock ranking on {scope_name} -- right behind the leader.",
    "Silver spot secured across your whole mock journey at this level -- #2 on {scope_name}.",
]

_MOCK_OVERALL_PODIUM_3 = [
    "You've cracked the top 3 of your overall mock journey -- #3 on {scope_name}.",
    "Podium finish across every mock at this level: 3rd place on {scope_name}.",
    "Bronze position in your cumulative mock standing -- you're #3 on {scope_name}.",
    "Your combined mock score just broke into the top 3 at this level -- #3 on {scope_name}, out of {total} students.",
    "3rd place, cumulative across the level. {scope_name} has you on the podium.",
    "You're on the podium across this level's whole mock journey -- #3 on {scope_name}.",
    "Top 3 in your overall mock standing -- currently #3 on {scope_name}.",
    "That's a podium finish on {scope_name}: 3rd place across every mock at this level.",
    "You just claimed the #3 cumulative mock spot -- {scope_name}.",
    "Bronze on the overall leaderboard -- #3 on {scope_name} and within reach of higher.",
]

_MOCK_OVERALL_IMPROVED = [
    "Your cumulative mock standing just climbed {spots_label} -- from #{prev_rank} to #{rank} on {scope_name}.",
    "Nice progress across your overall mock journey: you're up {spots_label}, now #{rank} on {scope_name}.",
    "That exam moved the needle on your cumulative standing -- #{prev_rank} to #{rank} on {scope_name}.",
    "You're climbing the level's overall mock standings -- #{rank} on {scope_name} now, {spots_label} better than before.",
    "Your whole mock journey at this level just improved -- {spots_label} gained, now #{rank} on {scope_name}.",
    "Momentum across every mock at this level: you've moved up to #{rank} on {scope_name}.",
    "That's forward progress on your cumulative mock record -- {spots_label} up, #{rank} on {scope_name}.",
    "Your overall mock ranking ticked up to #{rank} on {scope_name} -- {spots_label} ahead of where you were.",
    "Solid gain across the level's mock journey -- you're now #{rank} on {scope_name}.",
    "Every mock exam counts toward the cumulative total, and it shows: {spots_label} up, #{rank} on {scope_name}.",
]

_MOCK_OVERALL_DROPPED = [
    "Your cumulative mock standing eased back {spots_label} -- now #{rank} on {scope_name}, down from #{prev_rank}.",
    "This exam cost you {spots_label} in your overall mock standing -- currently #{rank} on {scope_name}.",
    "You're now #{rank} on {scope_name}, {spots_label} lower than before. Plenty of your mock journey left to climb back through.",
    "A step back in your cumulative mock record -- {spots_label} down, now #{rank} on {scope_name}.",
    "Your overall mock ranking slipped to #{rank} on {scope_name} -- {spots_label} behind your last position.",
    "Not your strongest exam this time -- #{rank} on {scope_name} now, down {spots_label}.",
    "The overall standings shifted under you: #{prev_rank} to #{rank} on {scope_name}.",
    "You've dropped to #{rank} on {scope_name} across the level's mock journey. One strong exam can close that gap again.",
    "Cumulative rank check: #{rank} on {scope_name} now, {spots_label} down from where you were.",
    "That exam pulled your overall mock average down a bit -- #{rank} on {scope_name}, {spots_label} lower.",
]

_MOCK_OVERALL_HELD = [
    "Steady across your whole mock journey -- you're still #{rank} on {scope_name}.",
    "No change in your cumulative mock standing: holding #{rank} on {scope_name}.",
    "You defended your overall mock ranking -- still #{rank} on {scope_name}.",
    "Consistent exam performance keeps you right at #{rank} on {scope_name}.",
    "Same spot in your cumulative standing -- #{rank} on {scope_name}, unchanged.",
    "You held the line across every mock at this level -- #{rank} on {scope_name}.",
    "Your overall mock position stayed put: #{rank} on {scope_name}.",
    "Still sitting at #{rank} on {scope_name} cumulatively -- steady exam performance holds its ground.",
    "No movement in your overall mock standing this time -- #{rank} on {scope_name}, right where you left it.",
    "You're holding firm at #{rank} on {scope_name} across the level's whole mock journey.",
]

_MOCK_OVERALL_FIRST = [
    "You're officially on the overall mock leaderboard! Your first qualifying exam puts you at #{rank} on {scope_name}.",
    "Welcome to {scope_name} -- you've entered the level's cumulative mock standings at #{rank}, out of {total} students.",
    "Your overall mock journey at this level just began -- starting rank: #{rank} on {scope_name}.",
    "First entry logged on the cumulative mock leaderboard -- you're #{rank} on {scope_name}.",
    "That's your first ranked result across the level's mock journey: #{rank} on {scope_name}, out of {total}.",
    "You're on the overall mock map now -- #{rank} on {scope_name} to start.",
    "New arrival on {scope_name} -- you've debuted at #{rank} in the level's cumulative mock standing.",
    "Your first appearance on the overall mock leaderboard: #{rank} on {scope_name}. Every climb starts somewhere.",
    "You've joined {scope_name} at #{rank} -- now your whole mock journey at this level begins.",
    "Fresh on the cumulative leaderboard: #{rank} on {scope_name}, your very first pooled mock result here.",
]


# ============================================================================
# Mock Specific Exam (single-exam standing)
# ============================================================================

_MOCK_SPECIFIC_PODIUM_1 = [
    "You're #1 on {scope_name}! Nobody's score on this exam beats yours right now.",
    "Top of the leaderboard for this exam: 1st place on {scope_name}.",
    "First place on {scope_name} -- out of {total} students who sat this exam, you're the one to beat.",
    "The strongest score on this exam is yours -- you lead {scope_name}.",
    "You've topped this exam's leaderboard. #1 on {scope_name}.",
    "Nobody's result on this exam is ahead of yours -- #1 on {scope_name}.",
    "That performance put you at the very top of this exam: 1st place on {scope_name}.",
    "This exam's #1 spot is yours -- {scope_name} now leads with your name.",
    "Best score on this exam, full stop. You're leading {scope_name}.",
    "You just became the one to beat on this exam -- #1 on {scope_name}.",
]

_MOCK_SPECIFIC_PODIUM_2 = [
    "2nd place on this exam -- your score puts you at #2 on {scope_name}.",
    "So close to the top of this exam: you're #2 on {scope_name} right now.",
    "A strong exam performance -- podium finish, 2nd place on {scope_name}.",
    "Your result has you sitting at #2 on {scope_name}, out of {total} students who sat this exam.",
    "Runner-up on this exam -- #2 on {scope_name}.",
    "One spot from the top of this exam: you're #2 on {scope_name}.",
    "That was a strong showing -- 2nd place on {scope_name} for this exam.",
    "Podium finish on this exam -- #2 on {scope_name} and closing in on the lead.",
    "That's a #2 ranking on this exam's leaderboard, {scope_name} -- right behind the leader.",
    "Silver spot secured on this exam -- #2 on {scope_name}.",
]

_MOCK_SPECIFIC_PODIUM_3 = [
    "You've cracked the top 3 on this exam -- #3 on {scope_name}.",
    "Podium finish on this exam: 3rd place on {scope_name}.",
    "Bronze position on this exam's leaderboard -- you're #3 on {scope_name}.",
    "Your score just broke into this exam's top 3 -- #3 on {scope_name}, out of {total} students.",
    "3rd place on this exam. {scope_name} has you on the podium.",
    "You're on the podium for this exam -- #3 on {scope_name}.",
    "Top 3 on this exam's leaderboard -- currently #3 on {scope_name}.",
    "That's a podium finish on {scope_name}: 3rd place for this exam.",
    "You just claimed this exam's #3 spot -- {scope_name}.",
    "Bronze on this exam's leaderboard -- #3 on {scope_name} and within reach of higher.",
]

_MOCK_SPECIFIC_IMPROVED = [
    "You moved up {spots_label} on this exam's re-attempt -- from #{prev_rank} to #{rank} on {scope_name}.",
    "Nice improvement on this exam: you're up {spots_label}, now #{rank} on {scope_name}.",
    "That re-attempt moved the needle -- #{prev_rank} to #{rank} on {scope_name}.",
    "You're climbing this exam's standings -- #{rank} on {scope_name} now, {spots_label} better than before.",
    "Your result on this exam just improved -- {spots_label} gained, now #{rank} on {scope_name}.",
    "Better showing this time: you've moved up to #{rank} on {scope_name}.",
    "That's forward progress on this exam -- {spots_label} up, #{rank} on {scope_name}.",
    "Your rank on this exam ticked up to #{rank} on {scope_name} -- {spots_label} ahead of before.",
    "Solid gain on this exam's leaderboard -- you're now #{rank} on {scope_name}.",
    "That attempt paid off: {spots_label} up, #{rank} on {scope_name}.",
]

_MOCK_SPECIFIC_DROPPED = [
    "Your standing on this exam eased back {spots_label} -- now #{rank} on {scope_name}, down from #{prev_rank}.",
    "This attempt cost you {spots_label} on this exam -- currently #{rank} on {scope_name}.",
    "You're now #{rank} on {scope_name} for this exam, {spots_label} lower than before.",
    "A step back on this exam -- {spots_label} down, now #{rank} on {scope_name}.",
    "Your rank on this exam slipped to #{rank} on {scope_name} -- {spots_label} behind your last position.",
    "Not your strongest attempt on this one -- #{rank} on {scope_name} now, down {spots_label}.",
    "This exam's standings shifted under you: #{prev_rank} to #{rank} on {scope_name}.",
    "You've dropped to #{rank} on {scope_name} for this exam. A stronger re-attempt can close that gap again.",
    "Exam rank check: #{rank} on {scope_name} now, {spots_label} down from where you were.",
    "That attempt pulled your rank down a bit on this exam -- #{rank} on {scope_name}, {spots_label} lower.",
]

_MOCK_SPECIFIC_HELD = [
    "Steady on this exam -- you're still #{rank} on {scope_name}.",
    "No change on this exam's leaderboard: holding #{rank} on {scope_name}.",
    "You defended your position on this exam -- still #{rank} on {scope_name}.",
    "Consistent performance keeps you right at #{rank} on {scope_name} for this exam.",
    "Same spot on this exam -- #{rank} on {scope_name}, unchanged.",
    "You held the line on this exam -- #{rank} on {scope_name}.",
    "Your position on this exam stayed put: #{rank} on {scope_name}.",
    "Still sitting at #{rank} on {scope_name} for this exam -- steady performance holds its ground.",
    "No movement on this exam's leaderboard this time -- #{rank} on {scope_name}, right where you left it.",
    "You're holding firm at #{rank} on {scope_name} for this exam.",
]

_MOCK_SPECIFIC_FIRST = [
    "You're officially on this exam's leaderboard! Your result puts you at #{rank} on {scope_name}.",
    "Welcome to {scope_name} -- you've entered this exam's standings at #{rank}, out of {total} students.",
    "Your first attempt on this exam is in the books -- starting rank: #{rank} on {scope_name}.",
    "First entry logged on this exam's leaderboard -- you're #{rank} on {scope_name}.",
    "That's your first ranked result on this exam: #{rank} on {scope_name}, out of {total}.",
    "You're on this exam's leaderboard map now -- #{rank} on {scope_name} to start.",
    "New arrival on {scope_name} -- you've debuted at #{rank} for this exam.",
    "Your first appearance on this exam's leaderboard: #{rank} on {scope_name}. Every climb starts somewhere.",
    "You've joined {scope_name} at #{rank} -- your standing on this exam starts here.",
    "Fresh on this exam's leaderboard: #{rank} on {scope_name}, your very first ranked result here.",
]


STUDENT_MESSAGE_POOLS: dict[tuple[str, str], list[str]] = {
    ("DPS_OVERALL", "PODIUM_1"): _DPS_OVERALL_PODIUM_1,
    ("DPS_OVERALL", "PODIUM_2"): _DPS_OVERALL_PODIUM_2,
    ("DPS_OVERALL", "PODIUM_3"): _DPS_OVERALL_PODIUM_3,
    ("DPS_OVERALL", "IMPROVED"): _DPS_OVERALL_IMPROVED,
    ("DPS_OVERALL", "DROPPED"): _DPS_OVERALL_DROPPED,
    ("DPS_OVERALL", "HELD"): _DPS_OVERALL_HELD,
    ("DPS_OVERALL", "FIRST_PLACEMENT"): _DPS_OVERALL_FIRST,

    ("DPS_SPECIFIC", "PODIUM_1"): _DPS_SPECIFIC_PODIUM_1,
    ("DPS_SPECIFIC", "PODIUM_2"): _DPS_SPECIFIC_PODIUM_2,
    ("DPS_SPECIFIC", "PODIUM_3"): _DPS_SPECIFIC_PODIUM_3,
    ("DPS_SPECIFIC", "IMPROVED"): _DPS_SPECIFIC_IMPROVED,
    ("DPS_SPECIFIC", "DROPPED"): _DPS_SPECIFIC_DROPPED,
    ("DPS_SPECIFIC", "HELD"): _DPS_SPECIFIC_HELD,
    ("DPS_SPECIFIC", "FIRST_PLACEMENT"): _DPS_SPECIFIC_FIRST,

    ("MOCK_OVERALL", "PODIUM_1"): _MOCK_OVERALL_PODIUM_1,
    ("MOCK_OVERALL", "PODIUM_2"): _MOCK_OVERALL_PODIUM_2,
    ("MOCK_OVERALL", "PODIUM_3"): _MOCK_OVERALL_PODIUM_3,
    ("MOCK_OVERALL", "IMPROVED"): _MOCK_OVERALL_IMPROVED,
    ("MOCK_OVERALL", "DROPPED"): _MOCK_OVERALL_DROPPED,
    ("MOCK_OVERALL", "HELD"): _MOCK_OVERALL_HELD,
    ("MOCK_OVERALL", "FIRST_PLACEMENT"): _MOCK_OVERALL_FIRST,

    ("MOCK_SPECIFIC", "PODIUM_1"): _MOCK_SPECIFIC_PODIUM_1,
    ("MOCK_SPECIFIC", "PODIUM_2"): _MOCK_SPECIFIC_PODIUM_2,
    ("MOCK_SPECIFIC", "PODIUM_3"): _MOCK_SPECIFIC_PODIUM_3,
    ("MOCK_SPECIFIC", "IMPROVED"): _MOCK_SPECIFIC_IMPROVED,
    ("MOCK_SPECIFIC", "DROPPED"): _MOCK_SPECIFIC_DROPPED,
    ("MOCK_SPECIFIC", "HELD"): _MOCK_SPECIFIC_HELD,
    ("MOCK_SPECIFIC", "FIRST_PLACEMENT"): _MOCK_SPECIFIC_FIRST,
}


# ============================================================================
# Teacher podium-only notifications (Shailesh's explicit choice: teachers
# are only ever notified for a podium placement, never improved/dropped/
# held/first). Kept distinct per dimension and per rank the same way the
# student pools are.
# ============================================================================

TEACHER_PODIUM_MESSAGE_POOLS: dict[tuple[str, int], list[str]] = {
    ("DPS_OVERALL", 1): [
        "{student_name} just took 1st place on {scope_name} -- the top practice record across the whole module.",
        "Podium alert: {student_name} is now #1 on {scope_name}, out of {total} students.",
        "{student_name}'s practice record just topped the module -- 1st place on {scope_name}.",
        "Great news -- {student_name} leads {scope_name} module-wide.",
        "{student_name} climbed to the very top of {scope_name}. Worth a mention next time you see them.",
        "1st place on {scope_name}: {student_name} is the module's strongest practice record right now.",
        "{student_name} just became #1 on {scope_name} -- ahead of all {total} students in the module.",
        "Podium news: {student_name} tops {scope_name} module-wide.",
    ],
    ("DPS_OVERALL", 2): [
        "{student_name} just landed 2nd place on {scope_name}, module-wide.",
        "Podium alert: {student_name} is now #2 on {scope_name}.",
        "{student_name} broke into the top 3 of {scope_name} -- 2nd place across the module.",
        "Nice run for {student_name}: 2nd place on {scope_name}, out of {total} students.",
        "{student_name} is on the podium -- #2 on {scope_name} module-wide.",
        "Podium news: {student_name} took 2nd on {scope_name}.",
        "{student_name}'s practice record just earned a podium finish -- #2 on {scope_name}.",
        "2nd place across the module: {student_name} on {scope_name}.",
    ],
    ("DPS_OVERALL", 3): [
        "{student_name} just cracked the top 3 on {scope_name} -- 3rd place, module-wide.",
        "Podium alert: {student_name} is now #3 on {scope_name}.",
        "{student_name} landed a podium finish on {scope_name} -- 3rd place across the module.",
        "Nice result for {student_name}: #3 on {scope_name}, out of {total} students.",
        "{student_name} is on the podium -- 3rd on {scope_name} module-wide.",
        "Podium news: {student_name} took 3rd on {scope_name}.",
        "{student_name} broke into the module's top 3 -- {scope_name}.",
        "3rd place across the module: {student_name} on {scope_name}.",
    ],
    ("DPS_SPECIFIC", 1): [
        "{student_name} just took 1st place on {scope_name} -- the top practice record at this level.",
        "Podium alert: {student_name} is now #1 on {scope_name}, out of {total} students.",
        "{student_name}'s practice record just topped this level -- 1st place on {scope_name}.",
        "Great news -- {student_name} leads {scope_name} at this level.",
        "{student_name} climbed to the very top of {scope_name}.",
        "1st place on {scope_name}: {student_name} is this level's strongest practice record right now.",
        "{student_name} just became #1 on {scope_name} -- ahead of all {total} students at this level.",
        "Podium news: {student_name} tops {scope_name} at this level.",
    ],
    ("DPS_SPECIFIC", 2): [
        "{student_name} just landed 2nd place on {scope_name} at this level.",
        "Podium alert: {student_name} is now #2 on {scope_name}.",
        "{student_name} broke into the top 3 of {scope_name} -- 2nd place at this level.",
        "Nice run for {student_name}: 2nd place on {scope_name}, out of {total} students.",
        "{student_name} is on the podium -- #2 on {scope_name} at this level.",
        "Podium news: {student_name} took 2nd on {scope_name}.",
        "{student_name}'s practice record just earned a podium finish -- #2 on {scope_name}.",
        "2nd place at this level: {student_name} on {scope_name}.",
    ],
    ("DPS_SPECIFIC", 3): [
        "{student_name} just cracked this level's top 3 on {scope_name} -- 3rd place.",
        "Podium alert: {student_name} is now #3 on {scope_name}.",
        "{student_name} landed a podium finish on {scope_name} -- 3rd place at this level.",
        "Nice result for {student_name}: #3 on {scope_name}, out of {total} students.",
        "{student_name} is on the podium -- 3rd on {scope_name} at this level.",
        "Podium news: {student_name} took 3rd on {scope_name}.",
        "{student_name} broke into this level's top 3 -- {scope_name}.",
        "3rd place at this level: {student_name} on {scope_name}.",
    ],
    ("MOCK_OVERALL", 1): [
        "{student_name} just took 1st place on {scope_name} -- the top cumulative mock record at this level.",
        "Podium alert: {student_name} is now #1 on {scope_name}, out of {total} students.",
        "{student_name}'s overall mock record just topped the level -- 1st place on {scope_name}.",
        "Great news -- {student_name} leads {scope_name}, cumulative across every mock at this level.",
        "{student_name} climbed to the very top of {scope_name}.",
        "1st place on {scope_name}: {student_name} has the strongest overall mock record right now.",
        "{student_name} just became #1 on {scope_name} -- ahead of all {total} students in the level's mock journey.",
        "Podium news: {student_name} tops {scope_name} cumulatively.",
    ],
    ("MOCK_OVERALL", 2): [
        "{student_name} just landed 2nd place on {scope_name}, cumulative across every mock.",
        "Podium alert: {student_name} is now #2 on {scope_name}.",
        "{student_name} broke into the top 3 of {scope_name} -- 2nd place overall.",
        "Nice run for {student_name}: 2nd place on {scope_name}, out of {total} students.",
        "{student_name} is on the podium -- #2 on {scope_name} across the level's whole mock journey.",
        "Podium news: {student_name} took 2nd on {scope_name}.",
        "{student_name}'s overall mock record just earned a podium finish -- #2 on {scope_name}.",
        "2nd place cumulatively: {student_name} on {scope_name}.",
    ],
    ("MOCK_OVERALL", 3): [
        "{student_name} just cracked the top 3 of {scope_name} -- 3rd place, cumulative.",
        "Podium alert: {student_name} is now #3 on {scope_name}.",
        "{student_name} landed a podium finish on {scope_name} -- 3rd place overall.",
        "Nice result for {student_name}: #3 on {scope_name}, out of {total} students.",
        "{student_name} is on the podium -- 3rd on {scope_name} across the level's mock journey.",
        "Podium news: {student_name} took 3rd on {scope_name}.",
        "{student_name} broke into the top 3 of the overall mock standings -- {scope_name}.",
        "3rd place cumulatively: {student_name} on {scope_name}.",
    ],
    ("MOCK_SPECIFIC", 1): [
        "{student_name} just took 1st place on {scope_name} -- top score on this exam.",
        "Podium alert: {student_name} is now #1 on {scope_name}, out of {total} students.",
        "{student_name}'s result just topped this exam -- 1st place on {scope_name}.",
        "Great news -- {student_name} leads {scope_name} for this exam.",
        "{student_name} climbed to the very top of {scope_name}.",
        "1st place on {scope_name}: {student_name} has the strongest score on this exam right now.",
        "{student_name} just became #1 on {scope_name} -- ahead of all {total} students on this exam.",
        "Podium news: {student_name} tops {scope_name} on this exam.",
    ],
    ("MOCK_SPECIFIC", 2): [
        "{student_name} just landed 2nd place on {scope_name} for this exam.",
        "Podium alert: {student_name} is now #2 on {scope_name}.",
        "{student_name} broke into this exam's top 3 -- 2nd place on {scope_name}.",
        "Nice run for {student_name}: 2nd place on {scope_name}, out of {total} students.",
        "{student_name} is on the podium -- #2 on {scope_name} for this exam.",
        "Podium news: {student_name} took 2nd on {scope_name}.",
        "{student_name}'s result just earned a podium finish -- #2 on {scope_name}.",
        "2nd place on this exam: {student_name} on {scope_name}.",
    ],
    ("MOCK_SPECIFIC", 3): [
        "{student_name} just cracked this exam's top 3 on {scope_name} -- 3rd place.",
        "Podium alert: {student_name} is now #3 on {scope_name}.",
        "{student_name} landed a podium finish on {scope_name} -- 3rd place on this exam.",
        "Nice result for {student_name}: #3 on {scope_name}, out of {total} students.",
        "{student_name} is on the podium -- 3rd on {scope_name} for this exam.",
        "Podium news: {student_name} took 3rd on {scope_name}.",
        "{student_name} broke into this exam's top 3 -- {scope_name}.",
        "3rd place on this exam: {student_name} on {scope_name}.",
    ],
}


# ============================================================================
# XP rank-tier promotion (Bronze -> Silver etc.). One shared pool -- this is
# a platform-wide progression system (see economy_service.py's RANK_TIERS),
# not scoped per leaderboard dimension, so it doesn't need the same 4-way
# split the leaderboard pools above do.
# ============================================================================

XP_RANK_PROMOTION_MESSAGES = [
    "Rank up! You've climbed from {old_tier} to {new_tier}.",
    "New tier unlocked -- you're now ranked {new_tier}, up from {old_tier}.",
    "Your XP just carried you past {old_tier} -- welcome to {new_tier}.",
    "Promotion earned: {old_tier} to {new_tier}. Your XP total made it happen.",
    "You've leveled up your rank -- {new_tier} is yours now, up from {old_tier}.",
    "That's a rank promotion: {old_tier} -> {new_tier}.",
    "Your dedication just paid off with a new rank -- {new_tier}, up from {old_tier}.",
    "Tier up! You've moved from {old_tier} to {new_tier}.",
    "You just broke into {new_tier} -- a step up from {old_tier}.",
    "Rank promotion unlocked: you're {new_tier} now, previously {old_tier}.",
    "Your XP total pushed you into a new tier -- {new_tier}, leaving {old_tier} behind.",
    "Climb complete: {old_tier} to {new_tier}. Your total XP got you here.",
    "A new rank is yours -- {new_tier}, promoted up from {old_tier}.",
    "You've earned your way into {new_tier} -- up from {old_tier}.",
    "Rank tier promotion: {old_tier} -> {new_tier}. Keep the momentum going.",
    "Your XP journey just hit a new milestone -- {new_tier}, up from {old_tier}.",
    "Officially promoted: {new_tier}, up from {old_tier}.",
    "You outgrew {old_tier} -- {new_tier} is your rank now.",
    "New rank, well earned: {new_tier} (previously {old_tier}).",
    "Your total XP crossed the line into {new_tier} -- congratulations on the promotion from {old_tier}.",
]


def spots_label(count: int) -> str:
    """Pre-pluralized 'N spot'/'N spots' -- avoids a template ever having to
    embed clunky '(s)' text directly."""
    count = abs(int(count))
    return f"{count} spot" if count == 1 else f"{count} spots"


def pick_message(pool: list[str], recently_used_indices: set[int]) -> tuple[str, int]:
    """Pure anti-repeat selection: returns (template_string, index) chosen
    from `pool`, avoiding any index in `recently_used_indices` when
    possible. Falls back to the full pool if every template has been used
    recently (a pool smaller than the recent-history window, or a very
    unlucky run) so this never raises or returns nothing.

    No DB/session dependency -- the caller (rank_notification_service.py)
    is responsible for reading recent template ids from the student's own
    Notification history and passing them in here.
    """
    if not pool:
        raise ValueError("pick_message() called with an empty pool")
    candidates = [i for i in range(len(pool)) if i not in recently_used_indices]
    if not candidates:
        candidates = list(range(len(pool)))
    chosen_index = random.choice(candidates)
    return pool[chosen_index], chosen_index
