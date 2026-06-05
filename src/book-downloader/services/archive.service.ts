import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import archiver from 'archiver';

@Injectable()
export class ArchiveService {
  private readonly logger = new Logger(ArchiveService.name);

  zipDirectory(sourceDir: string, outPath: string): Promise<void> {
    this.logger.log(`Compressing directory ${sourceDir} into ${outPath}`);
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        resolve();
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }
}
