export interface UserDetails {
    userId: string;
    email: string;
    name: string;
    botpressUserKeyId: string;
    userType: string;
    status: string;
    [key: string]: any;
}
export declare class UserService {
    private static instance;
    private readonly dynamoDbClient;
    private readonly logger;
    private readonly cacheService;
    private readonly usersTableName;
    private readonly cacheKeyPrefix;
    private readonly cacheTtl;
    private constructor();
    static getInstance(): UserService;
    getUserById(userId: string): Promise<UserDetails | null>;
    getBotpressUserKey(userId: string): Promise<string | null>;
}
//# sourceMappingURL=user.service.d.ts.map