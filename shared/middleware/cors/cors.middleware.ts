// shared/middleware/cors/cors.middleware.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context, Handler } from 'aws-lambda';
import { Logger } from '@shared/utils/logger';

const logger = new Logger('CorsMiddleware');

/**
 * Opciones para la configuración CORS
 */
export interface CorsOptions {
  allowOrigin?: string;
  allowCredentials?: boolean;
  allowMethods?: string;
  allowHeaders?: string;
  exposeHeaders?: string;
  maxAge?: number;
}

/**
 * Valores por defecto para la configuración CORS
 */
const defaultCorsOptions: CorsOptions = {
  allowOrigin: '*',
  // Nota: No podemos usar allowCredentials: true con allowOrigin: '*'
  allowCredentials: false,
  allowMethods: 'GET,POST,PUT,DELETE,OPTIONS',
  allowHeaders: 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,X-Requested-With,X-Amz-User-Agent',
  exposeHeaders: 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
  maxAge: 86400 // 24 horas
};

/**
 * Middleware para agregar headers CORS a todas las respuestas
 *
 * @param handler - El handler de Lambda a envolver
 * @param options - Opciones de configuración CORS
 * @returns Handler con CORS habilitado
 */
export const withCors = (
  handler: Handler,
  options: CorsOptions = {}
): Handler => {
  // Combinar opciones por defecto con las proporcionadas
  const corsOptions = { ...defaultCorsOptions, ...options };

  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    try {
      // Si es una solicitud OPTIONS, responder inmediatamente con los headers CORS
      if (event.httpMethod === 'OPTIONS') {
        logger.debug('Handling OPTIONS request with CORS headers');
        return {
          statusCode: 204,
          headers: getCorsHeaders(corsOptions),
          body: ''
        };
      }

      // Procesar la solicitud normalmente
      const result = await handler(event, context, null) as APIGatewayProxyResult;

      // Agregar headers CORS a la respuesta
      return {
        ...result,
        headers: {
          ...getCorsHeaders(corsOptions),
          ...result.headers
        }
      };
    } catch (error) {
      logger.error('Error in CORS middleware', { error: error.message });

      // En caso de error, asegurar que los headers CORS estén presentes
      return {
        statusCode: 500,
        headers: getCorsHeaders(corsOptions),
        body: JSON.stringify({
          message: 'Internal Server Error',
          error: process.env.STAGE === 'dev' ? error.message : 'An unexpected error occurred'
        })
      };
    }
  };
};

/**
 * Genera los headers CORS basados en las opciones proporcionadas
 *
 * @param options - Opciones de configuración CORS
 * @returns Objeto con los headers CORS
 */
function getCorsHeaders(options: CorsOptions): Record<string, string | boolean> {
  const headers: Record<string, string | boolean> = {
    'Access-Control-Allow-Origin': options.allowOrigin || defaultCorsOptions.allowOrigin
  };

  if (options.allowCredentials) {
    headers['Access-Control-Allow-Credentials'] = true;
  }

  if (options.allowMethods) {
    headers['Access-Control-Allow-Methods'] = options.allowMethods;
  }

  if (options.allowHeaders) {
    headers['Access-Control-Allow-Headers'] = options.allowHeaders;
  }

  if (options.exposeHeaders) {
    headers['Access-Control-Expose-Headers'] = options.exposeHeaders;
  }

  if (options.maxAge) {
    headers['Access-Control-Max-Age'] = options.maxAge.toString();
  }

  return headers;
}

/**
 * Middleware para manejar solicitudes preflight OPTIONS
 *
 * @param options - Opciones de configuración CORS
 * @returns Handler para manejar solicitudes OPTIONS
 */
export const corsPreflightHandler = (options: CorsOptions = {}): Handler => {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.debug('Handling preflight OPTIONS request');

    return {
      statusCode: 204,
      headers: getCorsHeaders({ ...defaultCorsOptions, ...options }),
      body: ''
    };
  };
};
