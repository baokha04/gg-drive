import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class BookScraperService {
  private readonly logger = new Logger(BookScraperService.name);

  private static readonly OLM_CDN_REGEX = /https:\/\/cdn3\.olm\.vn\/[^\s"']+/g;

  extractImageUrls(html: string): string[] {
    const matches = html.match(BookScraperService.OLM_CDN_REGEX) || [];
    return Array.from(new Set(matches));
  }

  async fetchHtml(url: string): Promise<string> {
    this.logger.log(`Fetching HTML from URL: ${url}`);
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        },
        timeout: 15000,
      });
      return response.data;
    } catch (err) {
      throw new Error(`Failed to access the book URL: ${err.message}`);
    }
  }
}
