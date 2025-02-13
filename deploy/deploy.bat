@echo off
setlocal

set STAGE=%1
if "%STAGE%"=="" set STAGE=dev

echo Deploying to stage: %STAGE%

echo KMS: Deploying KMS Infrastructure...
call serverless deploy --stage %STAGE% --config serverless-kms.yml --verbose

if errorlevel 1 (
    echo Error in KMS.
    exit /b 1
)

echo SNS: Deploying SNS Infrastructure...
call serverless deploy --stage %STAGE% --config serverless-sns.yml --verbose

if errorlevel 1 (
    echo Error in SNS.
    exit /b 1
)

echo Cognito: Deploying Cognito Infrastructure...
call serverless deploy --stage %STAGE% --config serverless-cognito.yml --verbose

if errorlevel 1 (
    echo Error in Cognito.
    exit /b 1
)

echo Phase 1: Deploying Infrastructure...
call serverless deploy --stage %STAGE% --config serverless-phase1.yml
if errorlevel 1 (
    echo Error in Phase 1.
    exit /b 1
)

echo Phase 2: Deploying Core Services...
call serverless deploy --stage %STAGE% --config serverless-phase2.yml
if errorlevel 1 (
    echo Error in Phase 2.
    exit /b 1
)

echo Phase 3: Deploying Data Layer...
call serverless deploy --stage %STAGE% --config serverless-phase3.yml
if errorlevel 1 (
    echo Error in Phase 3.
    exit /b 1
)

echo Phase 4: Deploying API Services...
call serverless deploy --stage %STAGE% --config serverless-phase4.yml
if errorlevel 1 (
    echo Error in Phase 4.
    exit /b 1
)

echo Phase 5: Deploying Monitoring...
call serverless deploy --stage %STAGE% --config serverless-phase5.yml
if errorlevel 1 (
    echo Error in Phase 5.
    exit /b 1
)

echo Deployment completed successfully!
goto :eof