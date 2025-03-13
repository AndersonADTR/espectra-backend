// services/auth/services/googleSheets.service.ts
import { google, sheets_v4 } from 'googleapis';
import { config } from '@shared/config/config.service';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { BaseError } from '@shared/utils/errors';

export class GoogleSheetsService {
  private static instance: GoogleSheetsService;
  private sheets: sheets_v4.Sheets | undefined;
  private spreadsheetId: string | undefined;
  private sheetName: string | undefined;

  // SSM Client
  private ssmClient = new SSMClient({ region: process.env.REGION || 'us-east-1' });

  static getInstance(): GoogleSheetsService {
    if (!GoogleSheetsService.instance) {
      GoogleSheetsService.instance = new GoogleSheetsService();
    }
    return GoogleSheetsService.instance;
  }

  async appendRow(rowData: string[]): Promise<string> {
    try {
      if (!this.sheets || !this.spreadsheetId || !this.sheetName) {
        throw new Error('Google Sheets service is not initialized');
      }
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:G`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowData]
        }
      });

      console.info('Row appended to Google Sheets', {
        spreadsheetId: this.spreadsheetId,
        range: response.data.tableRange
      });

      return response.data.updates?.updatedRange || '';
    } catch (error) {
      console.error('Error appending row to Google Sheets', { error });
      throw error;
    }
  }

  async validateSheet(): Promise<boolean> {
    try {
      if (!this.sheets || !this.spreadsheetId || !this.sheetName) {
        await this.getGoogleParameters();
      }
      // Verificar si podemos acceder a la hoja y si tiene la estructura correcta
      const response = await this.sheets?.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1:G1`
      });

      // Verificar si los encabezados existen y son correctos
      if (!response?.data.values || response.data.values.length === 0) {
        // Si no hay encabezados, los creamos
        await this.createHeaderRow();
        return true;
      }

      // Verificar que los encabezados coincidan con nuestra estructura esperada
      const expectedHeaders = [
        'RequestID', 'Name', 'Email', 'PhoneNumber', 'Status', 'CreatedAt', 'Metadata'
      ];
      
      const headers = response.data.values[0];
      const headersMatch = expectedHeaders.every((header, index) => 
        headers[index] === header
      );

      if (!headersMatch) {
        console.warn('Google Sheets headers do not match expected structure', {
          expected: expectedHeaders,
          actual: headers
        });
        // Actualizar encabezados si no coinciden
        await this.updateHeaderRow(expectedHeaders);
      }

      return true;
    } catch (error) {
      console.error('Error validating Google Sheet', { error });
      
      // Si la hoja no existe, intentamos crearla
      if ((error as BaseError).code === '404') {
        await this.createSheet();
        return true;
      }
      
      throw error;
    }
  }

  private async getGoogleParameters() {

    // Obtener la configuración de Google Sheets
    this.spreadsheetId = await this.getGoogleCredentials("google-sheets-spreadsheet-id");
    this.sheetName = config.get<string>('GOOGLE_SHEETS_CONTACT_REQUESTS_SHEET', 'SpectraContactRequests');
    
    // Autenticación con Google Sheets API
    // Para entorno de AWS Lambda, usamos clave privada almacenada en parámetros seguros
    const privateKey = await this.getGoogleCredentials("google-sheets-private-key");
    
    const clientEmail = await this.getGoogleCredentials("google-sheets-client-email");
    
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    this.sheets = google.sheets({ version: 'v4', auth });

    console.log("Google Sheets service initialized", {
      spreadsheetId: this.spreadsheetId,
      sheetName: this.sheetName,
      privateKey: privateKey,
      clientEmail: clientEmail,
      sheets: this.sheets
    })

    if (!this.sheets ||!this.spreadsheetId ||!this.sheetName) {
      throw new Error('Google Sheets service is not initialized');
    }
  }

  private async getGoogleCredentials(key: string): Promise<string | undefined> {  
    try {
      const response = await this.ssmClient.send(
        new GetParameterCommand({
          Name: `/espectra/dev/${key}`,
          WithDecryption: true
        })
      );
      return response.Parameter?.Value;
    } catch (error) {
      console.error('Error getting Google credentials:', error);
      return undefined;
    }
  }

  private async createHeaderRow(): Promise<void> {
    try {
      if (!this.sheets || !this.spreadsheetId || !this.sheetName) {
        throw new Error('Google Sheets service is not initialized');
      }
      const headers = [
        'RequestID', 'Name', 'Email', 'PhoneNumber', 'Status', 'CreatedAt', 'Metadata'
      ];

      await this.sheets?.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1:G1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headers]
        }
      });

      console.info('Header row created in Google Sheets');
    } catch (error) {
      console.error('Error creating header row in Google Sheets', { error });
      throw error;
    }
  }

  private async updateHeaderRow(headers: string[]): Promise<void> {
    try {
      if (!this.sheets || !this.spreadsheetId || !this.sheetName) {
        throw new Error('Google Sheets service is not initialized');
      }
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1:G1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [headers]
        }
      });

      console.info('Header row updated in Google Sheets');
    } catch (error) {
      console.error('Error updating header row in Google Sheets', { error });
      throw error;
    }
  }

  private async createSheet(): Promise<void> {
    try {
      if (!this.sheets || !this.spreadsheetId || !this.sheetName) {
        throw new Error('Google Sheets service is not initialized');
      }
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: this.sheetName
                }
              }
            }
          ]
        }
      });

      await this.createHeaderRow();
      console.info('New sheet created in Google Sheets');
    } catch (error) {
      console.error('Error creating sheet in Google Sheets', { error });
      throw error;
    }
  }
}