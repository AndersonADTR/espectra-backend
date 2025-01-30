@echo off
setlocal

set STAGE=%1
if "%STAGE%"=="" set STAGE=dev

:: Seguridad y Autenticación
aws ssm put-parameter --name "/espectra/%STAGE%/certificate-arn" --type "String" --value "arn:aws:acm:us-east-1:345594559631:certificate/CERT_ID" --description "Certificado SSL para el entorno" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/hosted-zone-name" --type "String" --value "espectra.com" --description "Zona hospedada para DNS" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/domain-name" --type "String" --value "api.espectra.com" --description "Dominio principal de la aplicación" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/ws-domain-name" --type "String" --value "ws.espectra.com" --description "Dominio para WebSocket" --overwrite

:: Credenciales de Botpress
aws ssm put-parameter --name "/espectra/%STAGE%/botpress-api-url" --type "String" --value "https://chat.botpress.cloud/a3d58c2c-c0bb-4db7-b344-9d87b18316ea" --description "URL de la API de Botpress" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/botpress-bot-id" --type "String" --value "187218ca-4f6d-4a78-a409-b374d3b714c1" --description "ID del bot en Botpress" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/botpress-api-key" --type "SecureString" --value "bp_pat_3Y0QthEYI6H0KUi55W8HynSumlam67m0bxD8" --description "Clave de API de Botpress" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/botpress-workspace-id" --type "String" --value "wkspace_01JDWDGCRZ2FTMTTBBEWW4YZGN" --description "ID del workspace de Botpress" --overwrite

:: Correos de Alertas
aws ssm put-parameter --name "/espectra/%STAGE%/alerts-email" --type "String" --value "alerts@espectra.com" --description "Email para alertas de alta prioridad" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/operations-email" --type "String" --value "ops@espectra.com" --description "Email para alertas de operaciones" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/support-email" --type "String" --value "support@espectra.com" --description "Email de soporte" --overwrite

:: Configuración de Red
aws ssm put-parameter --name "/espectra/%STAGE%/vpc-cidr" --type "String" --value "10.0.0.0/16" --description "CIDR de la VPC" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/public-subnet-cidrs" --type "String" --value "10.0.1.0/24,10.0.2.0/24" --description "CIDRs de subnets públicas" --overwrite

:: Configuración de Botpress
aws ssm put-parameter --name "/espectra/%STAGE%/botpress/webhook-secret" --type "SecureString" --value "WEBHOOK_SECRET" --description "Secreto para webhooks de Botpress" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/botpress/max-token-usage" --type "String" --value "8000" --description "Límite máximo de uso de tokens" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/botpress/handoff-timeout" --type "String" --value "300" --description "Timeout para transferencia de agentes" --overwrite

:: Configuración de Redis
aws ssm put-parameter --name "/espectra/%STAGE%/redis/max-connections" --type "String" --value "1000" --description "Máximo de conexiones permitidas" --overwrite

:: Claves de Seguridad
aws ssm put-parameter --name "/espectra/%STAGE%/encryption-key" --type "SecureString" --value "ENCRYPTION_KEY" --description "Clave de encriptación principal" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/jwt-secret" --type "SecureString" --value "JWT_SECRET" --description "Secreto para tokens JWT" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/webhook-signing-key" --type "SecureString" --value "WEBHOOK_SIGNING_KEY" --description "Clave para firmar webhooks" --overwrite

:: Configuraciones de Despliegue
aws ssm put-parameter --name "/espectra/%STAGE%/deployment/log-level" --type "String" --value "INFO" --description "Nivel de log para el entorno" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/deployment/debug-mode" --type "String" --value "false" --description "Modo de depuración" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/deployment/maintenance-mode" --type "String" --value "false" --description "Modo de mantenimiento" --overwrite

:: Configuración de DynamoDB
aws ssm put-parameter --name "/espectra/%STAGE%/dynamodb/read-capacity" --type "String" --value "5" --description "Capacidad de lectura predeterminada" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/dynamodb/write-capacity" --type "String" --value "5" --description "Capacidad de escritura predeterminada" --overwrite

:: Límites de Costos
aws ssm put-parameter --name "/espectra/%STAGE%/cost-limits/monthly-budget" --type "String" --value "1000" --description "Presupuesto mensual" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/cost-limits/lambda-timeout" --type "String" --value "29" --description "Timeout máximo de Lambda" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/cost-limits/api-throttling" --type "String" --value "1000" --description "Límites de throttling de API" --overwrite

:: Límites de Tokens por Plan
aws ssm put-parameter --name "/espectra/%STAGE%/token-limits/basic-plan" --type "String" --value "1000" --description "Límite de tokens para plan básico" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/token-limits/pro-plan" --type "String" --value "2000" --description "Límite de tokens para plan pro" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/token-limits/business-plan" --type "String" --value "4000" --description "Límite de tokens para plan business" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/token-limits/enterprise-plan" --type "String" --value "8000" --description "Límite de tokens para plan enterprise" --overwrite

:: SNS Topics
aws ssm put-parameter --name "/espectra/%STAGE%/sns/high-priority-topic" --type "String" --value "arn:aws:sns:us-east-1:345594559631:high-priority" --description "Tópico SNS de alta prioridad" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/sns/medium-priority-topic" --type "String" --value "arn:aws:sns:us-east-1:345594559631:medium-priority" --description "Tópico SNS de prioridad media" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/sns/low-priority-topic" --type "String" --value "arn:aws:sns:us-east-1:345594559631" --description "Tópico SNS de baja prioridad" --overwrite

echo Parámetros creados exitosamente.
pause