// mocks/aws-services.ts
export const mockAwsServices = {
    // Mock de KMS
    kms: {
      decrypt: async () => ({ Plaintext: 'decrypted-value' }),
      encrypt: async () => ({ CiphertextBlob: 'encrypted-value' })
    },
  
    // Mock de Cognito
    cognito: {
      verifyToken: async (token: string) => ({
        sub: 'test-user-id',
        email: 'test@example.com',
        userType: 'basic'
      })
    },
  
    // Mock de SNS
    sns: {
      publish: async (params: any) => ({
        MessageId: 'mock-message-id'
      })
    }
  };