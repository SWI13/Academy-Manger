"""
Root URL configuration.

Everything the platform exposes lives under /api/v1/. There is no unversioned
route, so a future v2 can exist beside v1 rather than replacing it.
"""

from django.conf import settings
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from apps.accounts.user_views import UserViewSet
from apps.core.health import health_view
from apps.courses.views import CourseViewSet
from apps.enrollments.views import EnrollmentViewSet
from apps.schedules.views import ScheduleViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("courses", CourseViewSet, basename="course")
router.register("enrollments", EnrollmentViewSet, basename="enrollment")
router.register("schedules", ScheduleViewSet, basename="schedule")

v1_patterns = [
    path("health/", health_view, name="health"),
    path("auth/", include("apps.accounts.urls")),
    *router.urls,
    # Phase 6+: students, professors, courses, enrollments, schedules,
    #           payments, reviews, notifications, reports, audit.
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
