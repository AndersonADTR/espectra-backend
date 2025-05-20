export declare class GoogleSheetsService {
    private static instance;
    private sheets;
    private spreadsheetId;
    private sheetName;
    private ssmClient;
    static getInstance(): GoogleSheetsService;
    appendRow(rowData: string[]): Promise<string>;
    validateSheet(): Promise<boolean>;
    private getGoogleParameters;
    private getGoogleCredentials;
    private createHeaderRow;
    private updateHeaderRow;
    private createSheet;
}
//# sourceMappingURL=googleSheets.service.d.ts.map