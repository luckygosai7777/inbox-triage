from django.urls import path

from . import views

urlpatterns = [
    path("google/start/", views.google_start, name="google-start"),
    path("google/callback/", views.google_callback, name="google-callback"),
    path("google/status/", views.connection_status, name="google-status"),
    path("google/disconnect/", views.disconnect_google, name="google-disconnect"),
    path("me/", views.me, name="auth-me"),
    path("dev-login/", views.dev_login, name="auth-dev-login"),
    path("signout/", views.sign_out, name="auth-signout"),
]
