// services/botpress/services/security/message-encryption.service.ts

import { KMS } from '@aws-sdk/client-kms';
import { BaseService } from '../base/base.service';

export class MessageEncryptionService extends BaseService {
  private readonly kms: KMS;
  private readonly keyId: string;

  constructor() {
    super('MessageEncryptionService');
    this.kms = new KMS({});
    this.keyId = process.env.CHAT_ENCRYPTION_KEY_ID!;

    if (!this.keyId) {
      throw new Error('CHAT_ENCRYPTION_KEY_ID environment variable is not set');
    }
  }

  async encryptMessage(message: string): Promise<string> {
    try {
      const { CiphertextBlob } = await this.kms.encrypt({
        KeyId: this.keyId,
        Plaintext: Buffer.from(message)
      });

      return Buffer.from(CiphertextBlob!).toString('base64');
    } catch (error) {
      this.handleError(error, 'Failed to encrypt message');
    }
  }

  async decryptMessage(encryptedMessage: string): Promise<string> {
    try {
      const { Plaintext } = await this.kms.decrypt({
        CiphertextBlob: Buffer.from(encryptedMessage, 'base64')
      });

      return Buffer.from(Plaintext!).toString('utf-8');
    } catch (error) {
      this.handleError(error, 'Failed to decrypt message');
    }
  }
}