import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';

@Injectable()
export class PageDownloaderService {
  private readonly logger = new Logger(PageDownloaderService.name);

  async downloadImageWithRetry(
    url: string,
    destPath: string,
    retries = 3,
  ): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      const writer = fs.createWriteStream(destPath);
      try {
        const response = await axios({
          url,
          method: 'GET',
          responseType: 'stream',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          },
          timeout: 10000,
        });

        response.data.pipe(writer);

        await new Promise<void>((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', (err) => {
            writer.close();
            reject(err);
          });
        });
        return;
      } catch (error) {
        writer.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        if (attempt === retries) {
          throw new Error(
            `Failed to download page from ${url} after ${retries} attempts: ${error.message}`,
          );
        }
        this.logger.warn(
          `Download attempt ${attempt} failed for ${url}. Retrying in 1s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
}
