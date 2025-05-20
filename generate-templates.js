/**
 * Script para generar plantillas serverless simplificadas
 *
 * Este script genera versiones simplificadas de las plantillas serverless
 * para facilitar el despliegue con Serverless Framework v4.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Configuración
const DEPLOYMENT_ID = 'v4r1';
const STAGE = 'dev';
const REGION = 'us-east-1';
const PROJECT_NAME = 'espectra-backend';
const COMPANY = 'technoapes';

// Plantillas a procesar
const templates = [
  {
    name: 'kms',
    source: 'serverless-kms.yml',
    dependencies: []
  },
  {
    name: 'sns',
    source: 'serverless-sns.yml',
    dependencies: ['kms']
  },
  {
    name: 'cognito',
    source: 'serverless-cognito.yml',
    dependencies: ['kms']
  },
  {
    name: 'phase1',
    source: 'serverless-phase1.yml',
    dependencies: ['kms']
  },
  {
    name: 'phase2',
    source: 'serverless-phase2.yml',
    dependencies: ['kms', 'phase1']
  },
  {
    name: 'phase3',
    source: 'serverless-phase3.yml',
    dependencies: ['kms', 'phase1', 'phase2']
  },
  {
    name: 'phase4',
    source: 'serverless-phase4.yml',
    dependencies: ['kms', 'phase1', 'phase2', 'phase3']
  },
  {
    name: 'phase5',
    source: 'serverless-phase5.yml',
    dependencies: ['kms', 'phase1', 'phase2', 'phase3', 'phase4']
  }
];

// Crear directorio para plantillas generadas
const outputDir = path.join(__dirname, 'generated');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Generar plantillas simplificadas
for (const template of templates) {
  console.log(`Generando plantilla para ${template.name}...`);

  // Crear plantilla base
  const serverlessConfig = {
    service: `${PROJECT_NAME}-${template.name}-${DEPLOYMENT_ID}`,
    provider: {
      name: 'aws',
      runtime: 'nodejs20.x',
      stage: STAGE,
      region: REGION,
      tags: {
        Project: PROJECT_NAME,
        Environment: STAGE,
        Component: template.name.charAt(0).toUpperCase() + template.name.slice(1),
        ManagedBy: 'serverless',
        Company: COMPANY
      }
    },
    custom: {
      projectName: PROJECT_NAME,
      stage: STAGE,
      deploymentId: DEPLOYMENT_ID,
      resourcePrefix: `${PROJECT_NAME}-${STAGE}-${DEPLOYMENT_ID}`
    },
    resources: [
      '${file(infrastructure/' + (template.name === 'kms' ? 'security/kms.yml' :
                                template.name === 'sns' ? 'sns/sns.yml' :
                                template.name === 'cognito' ? 'cognito/cognito.yml' :
                                template.name.startsWith('phase') ? template.name + '.yml' :
                                template.name + '.yml') + ')}'
    ],
    outputs: {}
  };

  // Agregar outputs específicos según la plantilla
  if (template.name === 'kms') {
    serverlessConfig.outputs = {
      SystemKeyId: {
        Value: { Ref: 'SystemKMSKey' },
        Export: { Name: '${self:custom.resourcePrefix}-kms.SystemKeyId' }
      },
      SystemKeyArn: {
        Value: { 'Fn::GetAtt': ['SystemKMSKey', 'Arn'] },
        Export: { Name: '${self:custom.resourcePrefix}-kms.SystemKeyArn' }
      },
      SecretsKeyId: {
        Value: { Ref: 'SecretsKMSKey' },
        Export: { Name: '${self:custom.resourcePrefix}-kms.SecretsKeyId' }
      },
      SecretsKeyArn: {
        Value: { 'Fn::GetAtt': ['SecretsKMSKey', 'Arn'] },
        Export: { Name: '${self:custom.resourcePrefix}-kms.SecretsKeyArn' }
      },
      WebsocketKeyId: {
        Value: { Ref: 'WebSocketKMSKey' },
        Export: { Name: '${self:custom.resourcePrefix}-kms.WebsocketKeyId' }
      },
      WebsocketKeyArn: {
        Value: { 'Fn::GetAtt': ['WebSocketKMSKey', 'Arn'] },
        Export: { Name: '${self:custom.resourcePrefix}-kms.WebsocketKeyArn' }
      }
    };
  } else if (template.name === 'sns') {
    serverlessConfig.outputs = {
      HighPriorityTopicArn: {
        Value: { Ref: 'HighPriorityTopic' },
        Export: { Name: '${self:custom.resourcePrefix}-sns.HighPriorityTopicArn' }
      },
      MediumPriorityTopicArn: {
        Value: { Ref: 'MediumPriorityTopic' },
        Export: { Name: '${self:custom.resourcePrefix}-sns.MediumPriorityTopicArn' }
      },
      LowPriorityTopicArn: {
        Value: { Ref: 'LowPriorityTopic' },
        Export: { Name: '${self:custom.resourcePrefix}-sns.LowPriorityTopicArn' }
      }
    };

    // Agregar configuraciones específicas para SNS
    serverlessConfig.custom.sns = {
      subscriptions: {
        highPriorityEmail: 'alerts@technoapes.co',
        mediumPriorityEmail: 'operations@technoapes.co',
        lowPriorityEmail: 'support@technoapes.co'
      },
      alarms: {
        deliveryErrorThreshold: 1,
        throttlingThreshold: 1,
        evaluationPeriods: 1,
        period: 300
      }
    };
  } else if (template.name === 'cognito') {
    serverlessConfig.outputs = {
      UserPoolId: {
        Value: { Ref: 'SpectraUserPool' },
        Export: { Name: '${self:custom.resourcePrefix}-cognito.UserPoolId' }
      },
      UserPoolClientId: {
        Value: { Ref: 'SpectraUserPoolClient' },
        Export: { Name: '${self:custom.resourcePrefix}-cognito.UserPoolClientId' }
      },
      UserPoolArn: {
        Value: { 'Fn::GetAtt': ['SpectraUserPool', 'Arn'] },
        Export: { Name: '${self:custom.resourcePrefix}-cognito.UserPoolArn' }
      },
      UserPoolDomain: {
        Value: { 'Fn::Sub': '${self:custom.resourcePrefix}-auth.auth.${AWS::Region}.amazoncognito.com' },
        Export: { Name: '${self:custom.resourcePrefix}-cognito.UserPoolDomain' }
      }
    };

    // Agregar configuraciones específicas para Cognito
    serverlessConfig.custom.cognito = {
      userPool: {
        emailSender: 'soporte@spectrumai.com.co',
        mfaConfiguration: 'OPTIONAL',
        passwordPolicy: {
          minLength: 8,
          requireLowercase: true,
          requireUppercase: true,
          requireNumbers: true,
          requireSymbols: true,
          temporaryPasswordValidityDays: 7
        }
      },
      userPoolClient: {
        accessTokenValidity: 1,
        idTokenValidity: 1,
        refreshTokenValidity: 30,
        authSessionValidity: 3
      },
      alarms: {
        signInErrorsThreshold: 10,
        signInErrorsEvaluationPeriods: 2,
        compromisedCredentialsThreshold: 1,
        period: 300
      }
    };
  }

  // Guardar la plantilla generada
  const outputPath = path.join(outputDir, `${template.name}.yml`);
  fs.writeFileSync(outputPath, yaml.dump(serverlessConfig, { lineWidth: 120 }));

  console.log(`  ✅ Plantilla generada: ${outputPath}`);
}

console.log('\nProceso completado. Plantillas generadas en el directorio "generated".');
