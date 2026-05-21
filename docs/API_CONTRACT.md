# API Contract v1

## Auth
POST /api/auth/login
GET /api/auth/me

## Student
GET /api/student/assignments
GET /api/student/dps/{dps_id}
POST /api/student/attempts/start
GET /api/student/attempts/{attempt_id}
POST /api/student/attempts/{attempt_id}/answers
POST /api/student/attempts/{attempt_id}/submit
POST /api/student/attempts/{attempt_id}/auto-submit
GET /api/student/attempts/{attempt_id}/result

## Admin
GET /api/admin/modules
GET /api/admin/modules/{module_id}/levels
GET /api/admin/levels/{level_id}/lessons
GET /api/admin/lessons/{lesson_id}/dps
GET /api/admin/dps/{dps_id}
POST /api/admin/dps/{dps_id}/generate-preview
POST /api/admin/assignments
GET /api/admin/dps/{dps_id}/results
GET /api/admin/attempts/{attempt_id}
