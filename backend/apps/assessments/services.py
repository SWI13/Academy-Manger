"""
Average calculation, and the atomic mark sheet.

Averages are computed here and nowhere else. Materialising them onto the
enrolment row is where the drift bug lives: a mark corrected six months later
would leave a stale average behind it, and marks never lock (D-7) so that
correction is expected, not exceptional.
"""

import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import Assessment, AssessmentScore

logger = logging.getLogger(__name__)


def enrollment_average(enrollment, *, published_only: bool = False) -> dict:
    """
    Weighted average across the assessments this enrolment has been marked for.

    Weights are relative, so 1/1/2 makes the last assessment worth half the
    course without anyone making the numbers sum to 100. Unmarked assessments
    are excluded rather than counted as zero - a student who has not sat the
    final has no final mark, which is not the same as failing it.
    """
    scores = AssessmentScore.objects.filter(enrollment=enrollment).select_related("assessment")
    if published_only:
        scores = scores.filter(assessment__is_published=True)

    total_weight = Decimal("0")
    weighted_sum = Decimal("0")
    components = []

    for score in scores:
        assessment = score.assessment
        percentage = (score.score / assessment.max_score) * 100
        weighted_sum += percentage * assessment.weight
        total_weight += assessment.weight
        components.append(
            {
                "assessment_id": assessment.pk,
                "title": assessment.title,
                "kind": assessment.kind,
                "score": score.score,
                "max_score": assessment.max_score,
                "weight": assessment.weight,
                "percentage": round(percentage, 2),
                "is_published": assessment.is_published,
            }
        )

    assessments_total = Assessment.objects.filter(course=enrollment.course)
    if published_only:
        assessments_total = assessments_total.filter(is_published=True)

    return {
        "weighted_percentage": round(weighted_sum / total_weight, 2) if total_weight else None,
        "marked_count": len(components),
        "assessment_count": assessments_total.count(),
        "components": components,
    }


@transaction.atomic
def save_mark_sheet(assessment, rows, *, actor) -> dict:
    """
    Write a whole mark sheet in one transaction.

    A teacher entering forty marks on institute Wi-Fi either saves all of them
    or none. A half-written sheet is the failure mode this prevents, and it is
    also why the endpoint is a PUT of the whole sheet rather than forty PATCHes.

    `rows` is a list of {"enrollment": Enrollment, "score": Decimal,
    "comment": str}. Callers validate membership and range before calling.
    """
    now = timezone.now()
    created = updated = 0

    existing = {
        score.enrollment_id: score
        for score in AssessmentScore.objects.select_for_update().filter(assessment=assessment)
    }

    for row in rows:
        enrollment = row["enrollment"]
        score = existing.get(enrollment.pk)

        if score is None:
            AssessmentScore.objects.create(
                assessment=assessment,
                enrollment=enrollment,
                score=row["score"],
                comment=row.get("comment", ""),
                entered_by=actor,
            )
            created += 1
            continue

        if score.score == row["score"] and score.comment == row.get("comment", ""):
            continue  # unchanged; do not inflate the edit count

        score.score = row["score"]
        score.comment = row.get("comment", "")
        score.last_changed_by = actor
        score.last_changed_at = now
        score.change_count += 1
        score.save(
            update_fields=[
                "score",
                "comment",
                "last_changed_by",
                "last_changed_at",
                "change_count",
                "updated_at",
            ]
        )
        updated += 1

    logger.info(
        "Mark sheet for assessment %s saved by %s: %d created, %d updated",
        assessment.pk,
        actor.public_id,
        created,
        updated,
    )
    return {"created": created, "updated": updated, "unchanged": len(rows) - created - updated}
