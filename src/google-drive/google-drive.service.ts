import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { google, drive_v3 } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class GoogleDriveService implements OnModuleInit {
  private readonly logger = new Logger(GoogleDriveService.name);
  private drive: drive_v3.Drive | null = null;
  private isMockMode = false;

  onModuleInit() {
    let credentialsData: any = null;
    const envJson = process.env.GOOGLE_CREDENTIALS_JSON;
    const customPath = process.env.GOOGLE_CREDENTIALS_PATH;

    if (envJson) {
      try {
        credentialsData = JSON.parse(envJson);
        this.logger.log('Loading Google credentials from GOOGLE_CREDENTIALS_JSON environment variable.');
      } catch (err) {
        try {
          const decoded = Buffer.from(envJson, 'base64').toString('utf8');
          credentialsData = JSON.parse(decoded);
          this.logger.log('Loading Google credentials from Base64 decoded GOOGLE_CREDENTIALS_JSON env variable.');
        } catch (base64Err) {
          this.logger.error('Failed to parse credentials from GOOGLE_CREDENTIALS_JSON env variable.');
        }
      }
    }

    if (!credentialsData) {
      const credsPath = customPath
        ? path.resolve(process.cwd(), customPath)
        : path.resolve(process.cwd(), 'credentials.json');

      if (fs.existsSync(credsPath)) {
        try {
          const content = fs.readFileSync(credsPath, 'utf8');
          credentialsData = JSON.parse(content);
          this.logger.log(`Loading Google credentials from file: ${credsPath}`);
        } catch (err) {
          this.logger.error(`Failed to parse credentials file at ${credsPath}: ${err.message}`);
        }
      } else {
        this.logger.warn(
          `Google credentials not found (checked GOOGLE_CREDENTIALS_JSON, GOOGLE_CREDENTIALS_PATH, and ${credsPath}). Starting Google Drive in Mock Mode.`,
        );
        this.isMockMode = true;
        return;
      }
    }

    try {
      const auth = new google.auth.GoogleAuth({
        credentials: credentialsData,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
      this.drive = google.drive({ version: 'v3', auth });
      this.logger.log('Google Drive API client initialized successfully.');
    } catch (error) {
      this.logger.error(
        'Failed to initialize Google Drive client. Falling back to Mock Mode.',
        error.stack,
      );
      this.isMockMode = true;
    }
  }

  get mode(): 'real' | 'mock' {
    return this.isMockMode ? 'mock' : 'real';
  }

  async getFolderName(folderId: string): Promise<string> {
    if (this.isMockMode || !this.drive) {
      return `Mock_Folder_${folderId.substring(0, Math.min(6, folderId.length))}`;
    }

    try {
      const res = await this.drive.files.get({
        fileId: folderId,
        fields: 'name',
      });
      return res.data.name || `Folder_${folderId}`;
    } catch (error) {
      this.logger.warn(`Could not fetch folder name for ID ${folderId}: ${error.message}. Using default.`);
      return `Folder_${folderId}`;
    }
  }

  async uploadZip(
    fileName: string,
    filePath: string,
    parentFolderId?: string,
  ): Promise<string> {
    if (this.isMockMode || !this.drive) {
      this.logger.log(`[MOCK] Uploading file ${fileName} to Google Drive (folder: ${parentFolderId || 'Root'})`);
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const mockId = Math.random().toString(36).substring(2, 15);
      return `https://drive.google.com/file/d/mock_id_${mockId}/view`;
    }

    try {
      const fileMetadata: any = {
        name: fileName,
        mimeType: 'application/zip',
      };

      if (parentFolderId) {
        fileMetadata.parents = [parentFolderId];
      }

      const media = {
        mimeType: 'application/zip',
        body: fs.createReadStream(filePath),
      };

      const file = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, webViewLink',
      });

      const webViewLink = file.data.webViewLink;
      if (!webViewLink) {
        throw new Error('Google Drive upload succeeded but did not return a webViewLink.');
      }

      this.logger.log(`Successfully uploaded ${fileName} to Google Drive. File ID: ${file.data.id}`);
      return webViewLink;
    } catch (error) {
      this.logger.error(`Failed to upload ${fileName} to Google Drive: ${error.message}`, error.stack);
      throw error;
    }
  }
}
