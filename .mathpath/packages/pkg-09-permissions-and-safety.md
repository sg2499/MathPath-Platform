# Package 9 (Phase 9): Permissions & Safety Audit

## Objective
Enforce the strict rules outlined in Phase 9:
* Admin: create, publish, assign, review
* Teacher: monitor/review only (No teacher assignment path)
* Student: attempt assigned mocks only

## Checklist

### 1. Backend RBAC Verification
- [ ] Verify `routes_teacher.py` has zero `POST`, `PUT`, or `DELETE` endpoints for Competition Mock definitions or assignments.
- [ ] Verify `routes_admin.py` mock endpoints are strictly protected by `admin_dep`.
- [ ] Verify `routes_student.py` strictly checks that `assignment.student_id == current_student.id` on mock attempt starts and submissions.

### 2. Frontend UI Safety
- [ ] Ensure Teacher UI `/teacher/competition` has no floating Action buttons (like "Assign" or "Create") hidden or exposed.
- [ ] Ensure Student UI `/student/competition` strictly handles cases where a student directly navigates to an attempt URL they are not authorized for (showing an "Unauthorized" or "Not Assigned" graphic instead of crashing).
- [ ] Ensure Admin UI `/admin/competition` properly cascades "Deletes" down to Teacher and Student views immediately (already partially implemented).

### 3. Edge-Case Hardening
- [ ] Ensure an archived or deactivated mock cannot be assigned by Admin.
- [ ] Ensure an archived mock already assigned cannot be started by a Student.
