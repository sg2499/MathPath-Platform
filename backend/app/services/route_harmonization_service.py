from typing import Any


def EmptyAssessmentEligibilityResponse(level_id: str | None = None) -> dict[str, Any]:
    return {
        "benchmarkPercentage": 70,
        "levelId": level_id,
        "totalStudents": 0,
        "readyCount": 0,
        "notReadyCount": 0,
        "rows": [],
        "routeStatus": "EMPTY_SAFE_SCOPE",
        "message": "No matching readiness records found for the selected scope.",
    }


def EmptyTeacherAssignmentOptionsResponse(module_id: str | None = None, level_id: str | None = None) -> dict[str, Any]:
    return {
        "summary": {
            "students": 0,
            "eligibleStudents": 0,
            "assignableStudents": 0,
            "alreadyAssigned": 0,
            "reattemptNeeded": 0,
            "availableAssessments": 0,
            "readinessBypassEnabled": False,
            "readinessGateMode": "EMPTY_SAFE_SCOPE",
            "readinessGateLabel": "No Matching Scope",
            "testingOverrideEnabled": False,
            "testingOverrideLabel": None,
            "readinessBypassStudents": 0,
            "testingOverrideStudents": 0,
            "strictReadinessMode": False,
            "assignmentGateMode": "EMPTY_SAFE_SCOPE",
            "assignmentGateLabel": "No Matching Scope",
            "blockedStudents": 0,
            "strictBlockedStudents": 0,
            "readyStudents": 0,
            "overrideAssignableStudents": 0,
            "temporaryBypassAssignableStudents": 0,
        },
        "students": [],
        "availableAssessments": [],
        "routeStatus": "EMPTY_SAFE_SCOPE",
        "filters": {"moduleId": module_id, "levelId": level_id},
        "message": "No matching teacher assignment options found for the selected scope.",
    }


def EmptyTeacherDpsOptionsResponse(module_id: str | None = None, level_id: str | None = None) -> dict[str, Any]:
    return {
        "summary": {
            "levels": 0,
            "dps": 0,
            "students": 0,
            "assignableStudents": 0,
        },
        "levels": [],
        "dps": [],
        "students": [],
        "routeStatus": "EMPTY_SAFE_SCOPE",
        "filters": {"moduleId": module_id, "levelId": level_id},
        "message": "No matching DPS assignment options found for the selected scope.",
    }


def ListEnvelope(items: list[Any], key: str = "items", route_status: str = "OK", **extra: Any) -> dict[str, Any]:
    return {
        "total": len(items),
        key: items,
        "routeStatus": route_status,
        **extra,
    }
