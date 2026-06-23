from django.contrib import admin
from django.urls import path
from core.views import recibir_asistencias # Importamos la vista que creamos antes

urlpatterns = [
    path('admin/', admin.site.get_urls()),
    path('api/asistencias/', recibir_asistencias), # Esta es la dirección de la "tubería"
]
