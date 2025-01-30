@echo off
setlocal

set STAGE=%1
if "%STAGE%"=="" set STAGE=dev

echo Deploying to stage: %STAGE%

echo KMS: Deploying KMS Infrastructure...
call serverless deploy --stage %STAGE% --config deploy/serverless-kms.yml --verbose

if errorlevel 1 (
    echo Error in KMS.
    exit /b 1
)

echo SNS: Deploying SNS Infrastructure...
call serverless deploy --stage %STAGE% --config deploy/serverless-sns.yml --verbose

if errorlevel 1 (
    echo Error in SNS.
    exit /b 1
)

echo Cognito: Deploying Cognito Infrastructure...
call serverless deploy --stage %STAGE% --config deploy/serverless-cognito.yml --verbose

if errorlevel 1 (
    echo Error in Cognito.
    exit /b 1
)

echo Main Services: Deploying Main Services Infrastructure...
call serverless deploy --stage %STAGE% --verbose

if errorlevel 1 (
    echo Error in Main Services.
    exit /b 1
)

echo Deployment completed successfully!