espectra-backend/
├── .gitignore
├── package.json
├── serverless.yml
├── tsconfig.json
├── .husky/
├── .serverless/
├── node_modules/
├── deploy/
│   ├── serverless-sns.yml
│   ├── serverless-kms.yml
│   ├── serverless-cognito.yml
│   ├── serverless-phase1.yml
│   ├── serverless-phase2.yml
│   ├── serverless-phase3.yml
│   ├── serverless-phase4.yml
│   ├── serverless-phase5.yml
│   └── create-parameters.bat
│   └── deploy.bat
├── infrastructure/
│   ├── apigateway/
│   │   ├── api.yml
│   │   └── chat-api-routes.yml
│   ├── backup/
│   │   └── backup.yml
│   ├── cognito/
│   │   └── cognito.yml
│   ├── dynamodb/
│   │   ├── botpress-tables.yml
│   │   ├── chat-history-tables.yml
│   │   ├── chat-session-tables.yml
│   │   ├── user-tables.yml
│   │   └── connection-concierge-tables.yml
│   ├── elasticache/
│   │   └── redis.yml
│   ├── eventbridge/
│   │   └── botpress-event-bus.yml
│   ├── iam/
│   │   ├── roles.yml
│   │   └── websocket-roles.yml
│   ├── monitoring/
│   │   ├── botpress-clodwatch-alarms.yml
│   │   ├── botpress-cloudwatch-dashboard.yml
│   │   ├── cloudwatch-alarms.yml
│   │   └── cloudwatch.yml
│   ├── network/
│   │   ├── security-groups.yml
│   │   └── vpc.yml
│   ├── queues/
│   │   └── message-queues.yml
│   ├── route53/
│   │   └── dns.yml
│   ├── security/
│   │   ├── kms.yml
│   │   ├── waf.yml
│   │   └── websocket-security.yml
│   ├── sns/
│   │   └── sns.yml
│   ├── websocket/
│   │   └── websocket.yml
│   └── validation.yml
├── scripts/
│   └── test-websocket-connection.ts
├── services/
│   ├── accounting/
│   ├── auth/
│   │   ├── handlers/
│   │   │   ├── authorizer.ts
│   │   │   ├── getUser.ts
│   │   │   ├── login.ts
│   │   │   ├── logout.ts
│   │   │   ├── refreshToken.ts
│   │   │   ├── register.ts
│   │   │   ├── session.handler.ts
│   │   │   └── verify.ts 
│   │   ├── models/
│   │   │   ├── metrics.model.ts
│   │   │   ├── session.model.ts
│   │   │   └── user.model.ts
│   │   ├── services/
│   │   │   ├── authentication.service.ts
│   │   │   ├── cognito.service.ts
│   │   │   ├── session.service.ts
│   │   │   └── token.service.ts
│   │   ├── types/
│   │   │   ├── auth.types.ts
│   │   │   └── metric.types.ts
│   │   └── utils/
│   │   │   ├── password.ts
│   │   │   └── validation.ts 
│   ├── botpress/
│   │   ├── config/
│   │   │   ├── config.ts
│   │   │   ├── config.types.ts
│   │   │   ├── error-messages.ts
│   │   │   ├── handoff.config.ts
│   │   │   └── response-templates.ts
│   │   ├── handlers/
│   │   │   ├── advisor.handler.ts
│   │   │   └── handoff.handler.ts
│   │   ├── middleware/
│   │   │   ├── authentication.middleware.ts
│   │   │   ├── error-handler.middleware.ts
│   │   │   └── request-validator.middleware.ts
│   │   ├── services/
│   │   │   ├── analytics/
│   │   │   │   └── botpress-analytics.service.ts
│   │   │   ├── base/
│   │   │   │   └── base.service.ts
│   │   │   ├── cache/
│   │   │   │   ├── cache.service.ts
│   │   │   │   └── handoff-cache.service.ts
│   │   │   ├── chat/
│   │   │   │   └── botpress-chat.service.ts
│   │   │   ├── context/
│   │   │   │   └── conversation-context.service.ts
│   │   │   ├── controllers/
│   │   │   │   └── handoff.controllers.ts
│   │   │   ├── events/
│   │   │   │   ├── handoff-event.service.ts
│   │   │   │   └── event-processor.service.ts
│   │   │   ├── feedback/
│   │   │   │   └── botpress-feedback.service.ts
│   │   │   ├── health/
│   │   │   │   └── botpress-health.service.ts
│   │   │   ├── metrics/
│   │   │   │   ├── handoff-metrics.service.ts
│   │   │   │   └── botpress-metrics.services.ts
│   │   │   ├── persistence/
│   │   │   │   └── handoff-persistence.service.ts
│   │   │   ├── queue/
│   │   │   │   └── message-queue.service.ts
│   │   │   ├── rate-limit/
│   │   │   │   └── botpress-rate-limit.service.ts
│   │   │   ├── retry/
│   │   │   │   └── retry-handle.service.ts
│   │   │   ├── session/
│   │   │   │   └── botpress-session.service.ts
│   │   │   ├── template/
│   │   │   │   └── botpress-template.service.ts
│   │   │   ├── token/
│   │   │   │   └── token-management.service.ts
│   │   │   ├── utils/
│   │   │   │   └── botpress-utils.service.ts
│   │   │   ├── validators/
│   │   │   │   └── handoff-validator.service.ts
│   │   │   ├── webhook/
│   │   │   │   └── webhook-handler.service.ts
│   │   │   ├── advisor.services.ts
│   │   │   ├── botpress.services.ts
│   │   │   ├── handoff-metrics.services.ts
│   │   │   ├── handoff.services.ts
│   │   │   └── message-handler.services.ts
│   │   ├── types/
│   │   │   ├── advisor.types.ts
│   │   │   ├── botpress.types.ts
│   │   │   ├── cache.types.ts
│   │   │   ├── chat.types.ts
│   │   │   ├── feedback.types.ts
│   │   │   ├── handoff.types.ts
│   │   │   ├── health.types.ts
│   │   │   ├── metrics.types.ts
│   │   │   ├── queue.types.ts
│   │   │   ├── token.types.ts
│   │   │   └── webhook.types.ts
│   │   └── utils/
│   │       └── errors.ts
│   ├── concierge/
│   ├── investment/
│   ├── legal/
│   ├── media/
│   └── websocket/
│       ├── config/
│       │   └── websocket.ts
│       ├── handlers/
│       │   ├── agent.handler.ts
│       │   ├── authorizer.handler.ts
│       │   ├── connect.handler.ts
│       │   ├── connection.handler.ts
│       │   ├── disconnect.handler.ts
│       │   └── message.handler.ts
│       ├── models/
│       │   └── connections.ts
│       ├── services/
│       │   ├── connection-manager.service.ts
│       │   ├── connection.service.ts
│       │   ├── message.service.ts
│       │   └── websocket.service.ts
│       ├── types/
│       │   ├── connection.types.ts
│       │   └── websocket.types.ts
│       └── utils/
│           ├── errors.ts
│           └── websocket.utils.ts
└── shared/
    ├── config/
    │   └── config-service.ts
    ├── middleware/
    │   ├── error/
    │   │   └── error-handling.middleware.ts
    │   ├── rate-limit/
    │   │   └── rate-limit.middleware.ts
    │   ├── security/
    │   │   ├── security.context.ts
    │   │   ├── security.middleware.ts
    │   │   └── security.service.ts
    │   └── validation/
    │       └── validation.middleware.ts
    ├── models/
    ├── services/
    │   ├── cache/
    │   │   ├── cache.decorator.ts
    │   │   ├── cache.service.ts
    │   │   └── redis.service.ts
    │   ├── observability/
    │   │   ├── anomaly-detection.service.ts
    │   │   └── observability.service.ts
    └── utils/
        ├── errors/
        │   ├── base-error.ts
        │   ├── error-handler.ts
        │   ├── http-error.ts
        │   ├── index.ts
        │   ├── rate-limit-error.ts
        │   ├── session-error.ts
        │   └── types.ts
        ├── metrics/
        │   ├── index.ts
        │   └── metrics.service.ts
        └── logger.ts