"""
Root URL configuration.

Everything the platform exposes lives under /api/v1/. There is no unversioned
route, so a future v2 can exist beside v1 rather than replacing it.
"""

from django.conf import settings
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from apps.accounts.user_views import UserViewSet
from apps.assessments.views import (
    AssessmentViewSet,
    CourseGradebookView,
    EnrollmentAverageView,
)
from apps.audit.views import AuditLogViewSet
from apps.core.health import health_view
from apps.courses.views import CourseViewSet
from apps.enrollments.views import EnrollmentViewSet
from apps.notifications.views import NotificationViewSet
from apps.payments.views import (
    EnrollmentBalanceView,
    PaymentViewSet,
    ProofDownloadView,
    ProofScanCallbackView,
)
from apps.reports.queries import RUNNERS
from apps.reports.views import (
    DashboardView,
    ExportDownloadView,
    ReportExportView,
    ReportExportViewSet,
    ReportView,
)
from apps.reviews.views import ReviewViewSet
from apps.schedules.views import ScheduleViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("courses", CourseViewSet, basename="course")
router.register("enrollments", EnrollmentViewSet, basename="enrollment")
router.register("schedules", ScheduleViewSet, basename="schedule")
router.register("assessments", AssessmentViewSet, basename="assessment")
router.register("payments", PaymentViewSet, basename="payment")
router.register("audit", AuditLogViewSet, basename="audit")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("reviews", ReviewViewSet, basename="review")
router.register("exports", ReportExportViewSet, basename="export")

# Built from the report registry rather than written out, so adding a
# report cannot leave a route behind - and an unknown name 404s at the
# router instead of reaching a view that has to decide what to do with it.
REPORT_NAMES = "|".join(RUNNERS)

v1_patterns = [
    path("health/", health_view, name="health"),
    path("auth/", include("apps.accounts.urls")),
    # Reports, not collections - a plain path each rather than a router entry.
    path("enrollments/<int:pk>/average/", EnrollmentAverageView.as_view(), name="average"),
    path("gradebook/", CourseGradebookView.as_view(), name="gradebook"),
    path("reports/dashboard/", DashboardView.as_view(), name="dashboard"),
    re_path(rf"^reports/(?P<name>{REPORT_NAMES})/$", ReportView.as_view(), name="report"),
    re_path(
        rf"^reports/(?P<name>{REPORT_NAMES})/export/$",
        ReportExportView.as_view(),
        name="report-export",
    ),
    path(
        "exports/<uuid:public_id>/download/",
        ExportDownloadView.as_view(),
        name="export-download",
    ),
    path("enrollments/<int:pk>/balance/", EnrollmentBalanceView.as_view(), name="balance"),
    path("proofs/<int:pk>/download/", ProofDownloadView.as_view(), name="proof-download"),
    path("proofs/<int:pk>/scanned/", ProofScanCallbackView.as_view(), name="proof-scanned"),
    *router.urls,
]

urlpatterns = [
    path("api/v1/", include((v1_patterns, "v1"))),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
]

if settings.DEBUG:
    urlpatterns += [
        path(
            "api/docs/",
            SpectacularSwaggerView.as_view(url_name="schema"),
            name="docs",
        ),
    ]
