from django.urls import path

from . import views

urlpatterns = [
    # mail
    path("mail/", views.mail_list, name="mail-list"),
    path("mail/sync/", views.mail_sync, name="mail-sync"),
    path("mail/bulk-delete/", views.mail_bulk_delete, name="mail-bulk-delete"),
    path("mail/vip-brief/", views.vip_brief, name="mail-vip-brief"),
    path("mail/vip-brief/<str:thread_id>/dismiss/", views.vip_brief_dismiss, name="mail-vip-brief-dismiss"),
    path("mail/<str:message_id>/", views.mail_detail, name="mail-detail"),
    path("mail/<str:message_id>/archive/", views.mail_archive, name="mail-archive"),
    path("mail/<str:message_id>/flag-vip/", views.mail_flag_vip, name="mail-flag-vip"),
    # metrics
    path("metrics/", views.metrics, name="metrics"),
    # important people
    path("vips/", views.vip_collection, name="vip-collection"),
    path("vips/<int:vip_id>/", views.vip_detail, name="vip-detail"),
    # subscriptions
    path("subscriptions/", views.subscription_list, name="subscription-list"),
    path("subscriptions/dormant/", views.subscription_dormant, name="subscription-dormant"),
    path("subscriptions/bulk/", views.subscription_bulk, name="subscription-bulk"),
    path("subscriptions/<int:subscription_id>/unsubscribe/", views.subscription_unsubscribe, name="subscription-unsubscribe"),
    path("subscriptions/<int:subscription_id>/blacklist/", views.subscription_blacklist, name="subscription-blacklist"),
    path("subscriptions/<int:subscription_id>/resubscribe/", views.subscription_resubscribe, name="subscription-resubscribe"),
    # schedule
    path("schedule/", views.schedule, name="schedule"),
    path("schedule/assign/", views.schedule_assign, name="schedule-assign"),
    path("schedule/rebuild/", views.schedule_rebuild, name="schedule-rebuild"),
]
