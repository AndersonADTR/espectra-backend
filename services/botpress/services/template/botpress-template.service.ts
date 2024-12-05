// services/botpress/services/template/botpress-template.service.ts

import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Logger } from '@shared/utils/logger';
import { MetricsService } from '@shared/utils/metrics';
import { BotpressMessage, MessagePayload } from '../../types/botpress.types';
import { BotpressError } from '../../utils/errors';

interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  content: MessagePayload;
  tags?: string[];
  metadata?: Record<string, any>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class BotpressTemplateService {
  private readonly logger: Logger;
  private readonly metrics: MetricsService;
  private readonly ddb: DynamoDBDocument;
  private readonly tableName: string;

  constructor() {
    this.logger = new Logger('BotpressTemplateService');
    this.metrics = new MetricsService('Spectra/Botpress');
    this.ddb = DynamoDBDocument.from(new DynamoDB({}));
    this.tableName = process.env.BOTPRESS_TEMPLATES_TABLE || '';

    if (!this.tableName) {
      throw new Error('BOTPRESS_TEMPLATES_TABLE environment variable is not set');
    }
  }

  async createTemplate(template: Omit<MessageTemplate, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<MessageTemplate> {
    const timestamp = new Date().toISOString();
    const newTemplate: MessageTemplate = {
      ...template,
      id: `tmpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    try {
      await this.ddb.put({
        TableName: this.tableName,
        Item: newTemplate,
        ConditionExpression: 'attribute_not_exists(id)'
      });

      this.logger.info('Template created successfully', {
        templateId: newTemplate.id,
        name: newTemplate.name
      });

      return newTemplate;
    } catch (error) {
      this.logger.error('Failed to create template', {
        error,
        templateName: template.name
      });
      throw new BotpressError('Failed to create message template');
    }
  }

  async getTemplate(templateId: string): Promise<MessageTemplate | null> {
    try {
      const result = await this.ddb.get({
        TableName: this.tableName,
        Key: { id: templateId }
      });

      return (result.Item as MessageTemplate) || null;
    } catch (error) {
      this.logger.error('Failed to get template', {
        error,
        templateId
      });
      throw new BotpressError('Failed to retrieve message template');
    }
  }

  async updateTemplate(
    templateId: string,
    updates: Partial<Omit<MessageTemplate, 'id' | 'version' | 'createdAt' | 'updatedAt'>>
  ): Promise<MessageTemplate> {
    try {
      const timestamp = new Date().toISOString();
      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {
        ':timestamp': timestamp,
        ':increment': 1
      };

      Object.entries(updates).forEach(([key, value]) => {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      });

      const result = await this.ddb.update({
        TableName: this.tableName,
        Key: { id: templateId },
        UpdateExpression: `SET version = version + :increment, updatedAt = :timestamp, ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      });

      const updatedTemplate = result.Attributes as MessageTemplate;

      this.logger.info('Template updated successfully', {
        templateId,
        version: updatedTemplate.version
      });

      return updatedTemplate;
    } catch (error) {
      this.logger.error('Failed to update template', {
        error,
        templateId
      });
      throw new BotpressError('Failed to update message template');
    }
  }

  async listTemplates(category?: string): Promise<MessageTemplate[]> {
    try {
      let queryParams: any = {
        TableName: this.tableName
      };

      if (category) {
        queryParams = {
          ...queryParams,
          IndexName: 'CategoryIndex',
          KeyConditionExpression: 'category = :category',
          ExpressionAttributeValues: {
            ':category': category
          }
        };
      }

      const result = await this.ddb.query(queryParams);
      return (result.Items as MessageTemplate[]) || [];
    } catch (error) {
      this.logger.error('Failed to list templates', {
        error,
        category
      });
      throw new BotpressError('Failed to list message templates');
    }
  }

  async deleteTemplate(templateId: string): Promise<void> {
    try {
      await this.ddb.delete({
        TableName: this.tableName,
        Key: { id: templateId }
      });

      this.logger.info('Template deleted successfully', { templateId });
    } catch (error) {
      this.logger.error('Failed to delete template', {
        error,
        templateId
      });
      throw new BotpressError('Failed to delete message template');
    }
  }

  async renderTemplate(
    template: MessageTemplate,
    variables: Record<string, any>
  ): Promise<BotpressMessage> {
    try {
      const renderedContent = this.replaceVariables(template.content, variables);

      return {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'text',
        payload: renderedContent,
        metadata: {
          ...template.metadata,
          templateId: template.id,
          templateVersion: template.version
        }
      };
    } catch (error) {
      this.logger.error('Failed to render template', {
        error,
        templateId: template.id
      });
      throw new BotpressError('Failed to render message template');
    }
  }

  private replaceVariables(
    content: MessagePayload,
    variables: Record<string, any>
  ): MessagePayload {
    const contentStr = JSON.stringify(content);
    const rendered = contentStr.replace(/\{\{(\w+)\}\}/g, (_, key) => 
      variables[key] !== undefined ? variables[key] : `{{${key}}}`
    );
    return JSON.parse(rendered);
  }
}