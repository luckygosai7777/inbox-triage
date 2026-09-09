from django.urls import path

from . import views

urlpatterns = [
    path("campaigns/", views.campaign_collection, name="campaign-collection"),
    path("campaigns/use-cases/", views.campaign_use_cases, name="campaign-use-cases"),
    path("campaigns/<int:campaign_id>/", views.campaign_detail, name="campaign-detail"),
    path("campaigns/<int:campaign_id>/documents/", views.campaign_documents, name="campaign-documents"),
    path("campaigns/<int:campaign_id>/documents/<int:document_id>/", views.campaign_document_detail, name="campaign-document-detail"),
    path("campaigns/<int:campaign_id>/add-recipient/", views.campaign_add_recipient, name="campaign-add-recipient"),
    path("campaigns/<int:campaign_id>/recipients/<int:recipient_id>/", views.campaign_recipient_detail, name="campaign-recipient-detail"),
    path("campaigns/<int:campaign_id>/import/", views.campaign_import_recipients, name="campaign-import"),
    path("campaigns/<int:campaign_id>/preview/", views.campaign_preview, name="campaign-preview"),
    path("campaigns/<int:campaign_id>/begin-review/", views.campaign_begin_review, name="campaign-begin-review"),
    path("campaigns/<int:campaign_id>/next/", views.campaign_next, name="campaign-next"),
    path("campaigns/<int:campaign_id>/send-record/", views.campaign_send_record, name="campaign-send-record"),
    path("campaigns/<int:campaign_id>/reset/", views.campaign_reset, name="campaign-reset"),
]
