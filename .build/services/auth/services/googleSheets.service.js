"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleSheetsService = void 0;
const googleapis_1 = require("googleapis");
const config_service_1 = require("@shared/config/config.service");
const client_ssm_1 = require("@aws-sdk/client-ssm");
class GoogleSheetsService {
    static instance;
    sheets;
    spreadsheetId;
    sheetName;
    ssmClient = new client_ssm_1.SSMClient({ region: process.env.REGION || 'us-east-1' });
    static getInstance() {
        if (!GoogleSheetsService.instance) {
            GoogleSheetsService.instance = new GoogleSheetsService();
        }
        return GoogleSheetsService.instance;
    }
    async appendRow(rowData) {
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
        }
        catch (error) {
            console.error('Error appending row to Google Sheets', { error });
            throw error;
        }
    }
    async validateSheet() {
        try {
            if (!this.sheets || !this.spreadsheetId || !this.sheetName) {
                await this.getGoogleParameters();
            }
            const response = await this.sheets?.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!A1:G1`
            });
            if (!response?.data.values || response.data.values.length === 0) {
                await this.createHeaderRow();
                return true;
            }
            const expectedHeaders = [
                'RequestID', 'Name', 'Email', 'PhoneNumber', 'Status', 'CreatedAt', 'Metadata'
            ];
            const headers = response.data.values[0];
            const headersMatch = expectedHeaders.every((header, index) => headers[index] === header);
            if (!headersMatch) {
                console.warn('Google Sheets headers do not match expected structure', {
                    expected: expectedHeaders,
                    actual: headers
                });
                await this.updateHeaderRow(expectedHeaders);
            }
            return true;
        }
        catch (error) {
            console.error('Error validating Google Sheet', { error });
            if (error.code === '404') {
                await this.createSheet();
                return true;
            }
            throw error;
        }
    }
    async getGoogleParameters() {
        this.spreadsheetId = await this.getGoogleCredentials("google-sheets-spreadsheet-id");
        this.sheetName = config_service_1.config.get('GOOGLE_SHEETS_CONTACT_REQUESTS_SHEET', 'SpectraContactRequests');
        const privateKey = await this.getGoogleCredentials("google-sheets-private-key");
        const clientEmail = await this.getGoogleCredentials("google-sheets-client-email");
        const auth = new googleapis_1.google.auth.JWT({
            email: clientEmail,
            key: privateKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        this.sheets = googleapis_1.google.sheets({ version: 'v4', auth });
        console.log("Google Sheets service initialized", {
            spreadsheetId: this.spreadsheetId,
            sheetName: this.sheetName,
            privateKey: privateKey,
            clientEmail: clientEmail,
            sheets: this.sheets
        });
        if (!this.sheets || !this.spreadsheetId || !this.sheetName) {
            throw new Error('Google Sheets service is not initialized');
        }
    }
    async getGoogleCredentials(key) {
        try {
            const response = await this.ssmClient.send(new client_ssm_1.GetParameterCommand({
                Name: `/espectra/dev/${key}`,
                WithDecryption: true
            }));
            return response.Parameter?.Value;
        }
        catch (error) {
            console.error('Error getting Google credentials:', error);
            return undefined;
        }
    }
    async createHeaderRow() {
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
        }
        catch (error) {
            console.error('Error creating header row in Google Sheets', { error });
            throw error;
        }
    }
    async updateHeaderRow(headers) {
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
        }
        catch (error) {
            console.error('Error updating header row in Google Sheets', { error });
            throw error;
        }
    }
    async createSheet() {
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
        }
        catch (error) {
            console.error('Error creating sheet in Google Sheets', { error });
            throw error;
        }
    }
}
exports.GoogleSheetsService = GoogleSheetsService;
//# sourceMappingURL=googleSheets.service.js.map