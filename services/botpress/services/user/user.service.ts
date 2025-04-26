// services/botpress/services/user/user.service.ts

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@shared/utils/logger';
import { CacheService } from '@shared/services/cache/cache.service';

export interface UserDetails {
  userId: string;
  email: string;
  name: string;
  botpressUserKeyId: string;
  userType: string;
  status: string;
  [key: string]: any;
}

export class UserService {
  private static instance: UserService;
  private readonly dynamoDbClient: DynamoDBDocumentClient;
  private readonly logger: Logger;
  private readonly cacheService: CacheService;
  private readonly usersTableName: string;
  private readonly cacheKeyPrefix: string = 'user:';
  private readonly cacheTtl: number = 3600; // 1 hora en segundos

  private constructor() {
    const client = new DynamoDBClient({});
    this.dynamoDbClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        // Eliminar valores undefined de los objetos
        removeUndefinedValues: true,
        // Convertir valores vacíos (strings, sets, listas) a null
        convertEmptyValues: true
      }
    });
    this.logger = new Logger('UserService');
    this.cacheService = CacheService.getInstance();
    this.usersTableName = process.env.USERS_TABLE ||
      `${process.env.SERVICE_NAME}-${process.env.STAGE}-users`;
  }

  public static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  /**
   * Obtiene los detalles de un usuario por su ID
   * @param userId ID del usuario
   * @returns Detalles del usuario o null si no se encuentra
   */
  public async getUserById(userId: string): Promise<UserDetails | null> {
    if (!userId) {
      this.logger.warn('Invalid userId provided to getUserById', { userId });
      return null;
    }

    const startTime = Date.now();
    const cacheKey = `${this.cacheKeyPrefix}${userId}`;

    try {
      // Intentar obtener de caché primero
      const cachedUser = await this.cacheService.get<UserDetails>(cacheKey);

      if (cachedUser) {
        this.logger.debug('User details retrieved from cache', { userId });
        return cachedUser;
      }

      // Obtener de DynamoDB si no está en caché
      const result = await this.dynamoDbClient.send(new GetCommand({
        TableName: this.usersTableName,
        Key: { userId }
      }));

      if (!result.Item) {
        this.logger.warn('User not found', { userId });
        return null;
      }

      const user = result.Item as UserDetails;

      // Verificar que el usuario tenga botpressUserKeyId
      if (!user.botpressUserKeyId) {
        this.logger.warn('User found but has no botpressUserKeyId', { userId });
      }

      // Guardar en caché solo si el usuario es válido
      await this.cacheService.set(cacheKey, user, { ttl: this.cacheTtl });

      this.logger.debug('User details retrieved from database', {
        userId,
        hasBotpressKey: !!user.botpressUserKeyId,
        latency: Date.now() - startTime
      });

      return user;
    } catch (error) {
      this.logger.error('Error retrieving user details', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });

      return null;
    }
  }

  /**
   * Obtiene la clave de usuario de Botpress para un usuario
   * @param userId ID del usuario
   * @returns Clave de usuario de Botpress o null si no se encuentra
   */
  public async getBotpressUserKey(userId: string): Promise<string | null> {
    if (!userId) {
      this.logger.warn('Invalid userId provided to getBotpressUserKey', { userId });
      return null;
    }

    try {
      // Intentar obtener directamente de caché primero para optimizar
      const cacheKey = `${this.cacheKeyPrefix}${userId}`;
      const cachedUser = await this.cacheService.get<UserDetails>(cacheKey);

      if (cachedUser && cachedUser.botpressUserKeyId) {
        return cachedUser.botpressUserKeyId;
      }

      // Si no está en caché o no tiene la clave, obtener del servicio completo
      const user = await this.getUserById(userId);

      if (!user) {
        this.logger.warn('User not found when retrieving Botpress key', { userId });
        return null;
      }

      if (!user.botpressUserKeyId) {
        this.logger.warn('User has no Botpress key assigned', {
          userId,
          userEmail: user.email,
          userStatus: user.status
        });
        return null;
      }

      return user.botpressUserKeyId;
    } catch (error) {
      this.logger.error('Error retrieving Botpress user key', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId
      });

      return null;
    }
  }
}
