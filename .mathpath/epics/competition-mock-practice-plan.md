# Competition Mock Practice — Plan of Action

## Phase 1 — Product Scope Lock
Finalize rules before coding:
* Who creates mocks: Admin
* Who assigns mocks: Admin only
* Who attempts mocks: Student
* Who monitors results: Admin + Teacher
* Impact on readiness/progression: None

## Phase 2 — Data Model
Add new independent tables for:
* CompetitionMockExam
* CompetitionMockQuestion
* CompetitionMockAssignment
* CompetitionMockAttempt
* CompetitionMockAnswer
* CompetitionMockResultSummary
This avoids mixing mock data with DPS or Assessment data.

## Phase 3 — Admin Features
Build Admin screens for:
* Competition Mock Studio
* Create mock by Module + Level
* Generate multiple mock papers
* Preview mock paper
* Publish/unpublish mock
* Assign one or multiple mocks to all students in a level
* Assign mocks to selected students
* Track completion/performance

## Phase 4 — Student Features
Add Student tab:
* Competition
Student sees:
* Assigned mock exams only
* Current-level mocks only
* Start Mock
* Timed competition attempt screen
* Result summary after submission
Button wording:
* Start Mock
* Submit Mock

## Phase 5 — Teacher Features
Add Teacher monitoring area:
* Competition Tracker
Teacher can view:
* Assigned mocks
* Completion status
* Score
* Accuracy
* Time taken
* Concept-wise strengths
* Concept-wise weaknesses
* Student-level performance history
Teacher does not assign mocks.

## Phase 6 — Mock Generation Engine
Create a level-wide generator that:
* Covers full level syllabus
* Balances all concepts taught in that level
* Creates varied mock versions
* Avoids memorization patterns
* Maintains competition difficulty
* Uses time-pressure appropriate question mix
For MM, this should reuse validated concept generators but with competition-specific balancing.

## Phase 7 — Attempt & Scoring Logic
Implement:
* Timer
* Auto-submit on time expiry
* Answer autosave
* Score calculation
* Accuracy calculation
* Time utilization
* Concept-wise analytics
* Weak-area detection
* Attempt history

## Phase 8 — Reports & Insights
Admin/Teacher/Student should see:
* Overall score
* Accuracy %
* Completion speed
* Time utilization
* Concept-wise performance
* Strengths
* Weaknesses
* Improvement trend

## Phase 9 — Permissions & Safety
Rules:
* Admin: create, publish, assign, review
* Teacher: monitor/review only
* Student: attempt assigned mocks only
No teacher assignment path.

## Phase 10 — Rollout Strategy
Build in safe packages:
* Package 1: Backend models + migrations
* Package 2: Admin mock studio shell
* Package 3: Mock generation engine
* Package 4: Admin assignment workflow
* Package 5: Student competition tab + attempt screen
* Package 6: Scoring/result summaries
* Package 7: Teacher tracker
* Package 8: Reports + polish + regression audit
