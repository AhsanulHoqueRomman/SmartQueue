from django.urls import path
from .views import CategoryListCreateView, CategoryDetailView

app_name = 'categories'

urlpatterns = [
    path('', CategoryListCreateView.as_view(), name='category_list_create'),
    path('<uuid:category_id>/', CategoryDetailView.as_view(), name='category_detail'),
]
