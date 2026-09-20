"""
One printable endpoint, added to any list resource.

Every printed document in this platform is the *same query the screen ran*,
answered without a page boundary. That is the whole design: a print button
that re-derives its own filters would drift from the list above it, and a
printed report that silently stops at row 25 is worse than no report at all
because it looks complete.

So a viewset opts in with one mixin and one line in `required_permissions`:

    UserPrintSerializer = print_response_serializer(UserSerializer, "UserPrint")

    @print_schema(UserPrintSerializer)
    class UserViewSet(PrintableMixin, ScopedModelViewSet):
        required_permissions = {..., "printable": "user.view"}

and gets `GET .../print/` answering the caller's own filters, unpaginated,
scoped exactly as the list is.

---------------------------------------------------------------------------
Printing is never a way around a permission
---------------------------------------------------------------------------
The action goes through both gates like any other. Gate 2 checks the
codename mapped to `printable`; gate 3 is `get_queryset`, which is the
*same* scoped and filtered queryset the list uses - not a second one written
for printing, which is how the two would eventually disagree. A professor
printing a roster gets their own courses because `scope_queryset` says so,
and there is no code path here that could widen it.
"""

from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response

# The point past which a list is not a thing anybody prints. Not a page size:
# a request for more rows than this is more likely a mistake than an
# intention, and the response says when it has been reached rather than
# quietly truncating.
PRINT_LIMIT = 2000


def print_response_serializer(item_serializer, name: str):
    """
    The response shape for one printable resource.

    Built rather than written out ten times, so every print endpoint answers
    with the same four keys and the generated TypeScript has a named type for
    each. `count` is the size of the whole selection and `truncated` says
    whether the rows below it are all of them - a sheet that is only the first
    two thousand of three thousand has to be able to say so on the paper.
    """
    return type(
        name,
        (serializers.Serializer,),
        {
            "results": item_serializer(many=True),
            "count": serializers.IntegerField(),
            "truncated": serializers.BooleanField(),
            "printed_at": serializers.DateTimeField(),
        },
    )


def print_schema(response_serializer):
    """
    Declare what `.../print/` answers with.

    Needed because drf-spectacular reads decorators, not attributes: without
    this it infers the *item* serializer from the action and types the
    endpoint as a bare object, which is exactly the `unknown` in the generated
    TypeScript that the generated types exist to prevent. Applied to the
    viewset, beside its other `extend_schema_view` entries.
    """
    return extend_schema_view(
        printable=extend_schema(
            summary="The current selection, unpaginated, for printing",
            responses={200: response_serializer},
        )
    )


class PrintableMixin:
    """
    `GET .../print/` - the current selection, whole.

    The rows are serialized with whatever `get_serializer_class()` returns for
    this action, which for every viewset in this codebase is the read
    serializer, because the write branches test for create and update.

    What the endpoint *answers* with is declared by `@print_schema` on the
    viewset - see the note there about why an attribute would not do.
    """

    print_limit = PRINT_LIMIT

    def get_print_queryset(self):
        """
        Override where a printed document wants a different order to a screen.

        A ledger reads down the page the way the month ran; a screen puts the
        newest row at the top. Same rows, same filters, opposite order.
        """
        return self.filter_queryset(self.get_queryset())

    @action(detail=False, methods=["get"], url_path="print", pagination_class=None)
    def printable(self, request):
        selection = self.get_print_queryset()
        count = selection.count()
        rows = selection[: self.print_limit]

        serializer_class = self.get_serializer_class()
        return Response(
            {
                "results": serializer_class(
                    rows, many=True, context=self.get_serializer_context()
                ).data,
                "count": count,
                "truncated": count > self.print_limit,
                "printed_at": timezone.now(),
            }
        )
