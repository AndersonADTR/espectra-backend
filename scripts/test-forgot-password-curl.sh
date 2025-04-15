#!/bin/bash

# Configuración
API_URL="https://zjgnryu8yj.execute-api.us-east-1.amazonaws.com/dev"
EMAIL="andersonmontilva@gmail.com"

# Crear archivo temporal con el cuerpo de la solicitud
echo "{\"email\":\"$EMAIL\"}" > /tmp/forgot-password-body.json

echo "Probando endpoint forgot-password con curl..."
echo "URL: $API_URL/auth/forgot-password"
echo "Cuerpo: $(cat /tmp/forgot-password-body.json)"

# Ejecutar curl con opciones detalladas
curl -v -X POST "$API_URL/auth/forgot-password" \
  -H "Content-Type: application/json" \
  -H "User-Agent: PostmanRuntime/7.32.3" \
  -H "Accept: */*" \
  -H "Accept-Encoding: gzip, deflate, br" \
  -H "Connection: keep-alive" \
  -d @/tmp/forgot-password-body.json

echo -e "\n\nProbando endpoint test-email con curl..."
echo "URL: $API_URL/auth/test-email"
echo "Cuerpo: $(cat /tmp/forgot-password-body.json)"

# Ejecutar curl para test-email
curl -v -X POST "$API_URL/auth/test-email" \
  -H "Content-Type: application/json" \
  -H "User-Agent: PostmanRuntime/7.32.3" \
  -H "Accept: */*" \
  -H "Accept-Encoding: gzip, deflate, br" \
  -H "Connection: keep-alive" \
  -d @/tmp/forgot-password-body.json

# Eliminar archivo temporal
rm /tmp/forgot-password-body.json
