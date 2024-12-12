// services/botpress/types/advisor.types.ts

export interface AdvisorStatus {
    advisorId: string;
    status: 'available' | 'busy' | 'offline';
    lastUpdated: string;
    activeConversations: number;
    metadata?: {
      name?: string;
      email?: string;
      specialties?: string[];
    };
}