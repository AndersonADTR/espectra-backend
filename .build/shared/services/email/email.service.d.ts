export interface EmailOptions {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    from?: string;
    replyTo?: string;
}
export declare class EmailService {
    private static instance;
    private client;
    private logger;
    private defaultSender;
    private region;
    private constructor();
    static getInstance(): EmailService;
    sendEmail(options: EmailOptions): Promise<string>;
    sendPasswordResetEmail(to: string, resetCode: string, isBackup?: boolean): Promise<string>;
    sendVerificationEmail(to: string, verificationCode: string, isBackup?: boolean): Promise<string>;
    verifyEmailIdentity(email: string): Promise<void>;
}
//# sourceMappingURL=email.service.d.ts.map