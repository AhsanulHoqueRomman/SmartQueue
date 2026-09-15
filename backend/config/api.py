from django.core.paginator import EmptyPage, Paginator
from django.db.models import Q
from rest_framework.response import Response


def apply_list_query(
    queryset,
    request,
    *,
    filter_fields=(),
    search_fields=(),
    ordering_fields=(),
    default_ordering=(),
):
    for field in filter_fields:
        value = request.query_params.get(field)
        if value not in (None, ''):
            queryset = queryset.filter(**{field: value})

    search = request.query_params.get('search', '').strip()
    if search and search_fields:
        search_query = Q()
        for field in search_fields:
            search_query |= Q(**{f'{field}__icontains': search})
        queryset = queryset.filter(search_query)

    ordering = request.query_params.get('ordering')
    if ordering:
        requested_fields = ordering.split(',')
        valid_fields = {
            field for field in ordering_fields
        }
        requested_fields = [
            field for field in requested_fields
            if field.lstrip('-') in valid_fields
        ]
        if requested_fields:
            queryset = queryset.order_by(*requested_fields)
    elif default_ordering:
        queryset = queryset.order_by(*default_ordering)
    return queryset


def list_response(queryset, serializer_class, request, *, context=None):
    """Return legacy arrays by default and an envelope when pagination is requested."""
    page = request.query_params.get('page')
    page_size = request.query_params.get('page_size')
    if page is None and page_size is None:
        return Response(serializer_class(queryset, many=True, context=context).data)

    try:
        page_number = int(page or 1)
        requested_size = int(page_size or 20)
    except ValueError:
        return Response({'detail': 'page and page_size must be integers.'}, status=400)
    if page_number < 1 or requested_size < 1:
        return Response({'detail': 'page and page_size must be positive.'}, status=400)

    paginator = Paginator(queryset, min(requested_size, 100))
    try:
        page_obj = paginator.page(page_number)
    except EmptyPage:
        return Response({'detail': 'That page contains no results.'}, status=404)
    return Response({
        'count': paginator.count,
        'next': page_obj.next_page_number() if page_obj.has_next() else None,
        'previous': page_obj.previous_page_number() if page_obj.has_previous() else None,
        'results': serializer_class(page_obj.object_list, many=True, context=context).data,
    })
