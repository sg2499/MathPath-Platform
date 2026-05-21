# Frontend Working Version v1

## Completed Screens

### Student
- `/login`
- `/student/dashboard`
- `/student/dps/[dpsId]`
- `/student/attempt/[attemptId]`
- `/student/result/[attemptId]`

### Admin
- `/admin/dashboard`
- `/admin/curriculum`
- `/admin/dps/[dpsId]`
- `/admin/assignments/create`
- `/admin/results/dps/[dpsId]`
- `/admin/results/attempts/[attemptId]`

## Important Product Behavior

- Correct answer is not shown to students before submission.
- Student receives only safe MCQ payload.
- The attempt timer uses backend `remainingSeconds` as starting source.
- Answer selections call auto-save API.
- Manual submit and auto-submit are both wired.
- Admin preview can show correct answer.

## Integration Note

This frontend expects the API response keys defined in API Contract v1. If the backend returns snake_case instead of camelCase, add a normalization layer in `lib/api/*.ts` or adjust backend serializers.
