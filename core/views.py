from django.http import JsonResponse

def recibir_asistencias(request):
    return JsonResponse({
        "status": "ok"
    })