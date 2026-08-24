"""
Two pagination styles, chosen per resource.

Staff tables get page numbers because a receptionist expects to jump to page 7.
Append-only, unbounded lists - the audit log, notifications - get cursors,
because deep OFFSET on a growing table degrades and can skip rows when new
ones arrive mid-pagination.
"""

from rest_framework.pagination import CursorPagination, PageNumberPagination


class StandardPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100  # capped: an unbounded page_size is a denial-of-service knob


class AppendOnlyCursorPagination(CursorPagination):
    page_size = 50
    max_page_size = 200
    ordering = "-created_at"
    cursor_query_param = "cursor"
