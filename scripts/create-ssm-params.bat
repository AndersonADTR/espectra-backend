# Crear un archivo batch para Windows (create-ssm-params.bat)
@echo off

set STAGE=dev
set SERVICE=espectra-backend

:: Botpress Parameters
aws ssm put-parameter --name "/%SERVICE%/%STAGE%/botpress-api-url" --value "https://chat.botpress.cloud/a3d58c2c-c0bb-4db7-b344-9d87b18316ea" --type "SecureString" --overwrite
aws ssm put-parameter --name "/%SERVICE%/%STAGE%/botpress-bot-id" --value "187218ca-4f6d-4a78-a409-b374d3b714c1" --type "SecureString" --overwrite
aws ssm put-parameter --name "/%SERVICE%/%STAGE%/botpress-api-key" --value "bp_pat_3Y0QthEYI6H0KUi55W8HynSumlam67m0bxD8" --type "SecureString" --overwrite
aws ssm put-parameter --name "/%SERVICE%/%STAGE%/botpress-workspace-id" --value "wkspace_01JDWDGCRZ2FTMTTBBEWW4YZGN" --type "SecureString" --overwrite

:: Redis Parameters
aws ssm put-parameter --name "/%SERVICE%/%STAGE%/redis-host" --value "localhost" --type "String" --overwrite
aws ssm put-parameter --name "/%SERVICE%/%STAGE%/redis-port" --value "6379" --type "String" --overwrite

:: Domain Parameters
aws ssm put-parameter --name "/espectra/%STAGE%/domain-name" --value "api.espectra.com" --type "String" --overwrite
aws ssm put-parameter --name "/espectra/%STAGE%/ws-domain-name" --value "ws.espectra.com" --type "String" --overwrite

aws ssm put-parameter --name "/%SERVICE%/dev/hosted-zone-name" --value "espectra.com." --type String --description "Route53 Hosted Zone name for Espectra domains"

:: Certificate ARN (requerido para HTTPS)
aws ssm put-parameter --name "/espectra/%STAGE%/certificate-arn" --value "arn:aws:acm:us-east-1:your-account-id:certificate/your-certificate-id" --type "String" --overwrite

:: SNS Topic ARN
aws ssm put-parameter --name "/%SERVICE%/%STAGE%/sns-alarm-topic-arn" --value "arn:aws:sns:us-east-1:your-account-id:your-topic-name" --type "String" --overwrite

echo Parameters created successfully!