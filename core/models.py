# models.py
from django.db import models

class Alumno(models.Model):
    id_alumno = models.CharField(max_length=50, primary_key=True)
    nombres = models.CharField(max_length=100)
    apellidos = models.CharField(max_length=100)
    grado = models.CharField(max_length=20)
    escuela = models.CharField(max_length=100)
    edad = models.IntegerField()

    def __str__(self):
        return f"{self.nombres} {self.apellidos}"

class Asistencia(models.Model):
    alumno = models.ForeignKey(Alumno, on_delete=models.CASCADE)
    fecha = models.DateField(auto_now_add=True)

    class Meta:
        # Evita duplicar asistencia el mismo día por error humano
        unique_together = ('alumno', 'fecha')