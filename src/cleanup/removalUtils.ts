import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';

@Injectable()
export class FileRemoval {
  private readonly logger = new Logger(FileRemoval.name);

  public async cleanupReadyForRemovalJobs(jobs: any[]): Promise<void> {
    for (const job of jobs.filter(job => job.status === 'ready-for-removal')) {
      await this.removeFile(job.outputPath);
    }
  }

  public async removeFile(filePath: string): Promise<void> {
    let retries = 3;

    while (retries > 0) {
      try {
        // Check if file exists
        const exists = await this.fileExists(filePath);
        if (!exists) {
          this.logger.log(`File does not exist: ${filePath} - no action needed`);
          return;
        }

        // Check if file is deletable
        const isDeletable = await Promise.race([
          this.isFileDeletable(filePath),
          this.delay(5000), // Timeout after 5000ms
        ]);

        if (!isDeletable) {
          throw new Error(`File is busy or check timed out: ${filePath}`);
        }

        await fs.unlink(filePath); // Attempt to delete the file
        this.logger.log(`Removed file: ${filePath}`);
        return; // Exit if successful
      } catch (error) {
        retries--;
        if (retries > 0 && (error.code === 'EBUSY' || error.message.includes('timed out'))) {
          this.logger.warn(`Retrying file removal (${retries} retries left): ${filePath}`);
          await this.delay(5000); // Wait before retrying
        } else {
          this.logger.error(`Error removing file ${filePath}: ${error.message}`);
          break; // Exit loop on final failure
        }
      }
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async isFileDeletable(filePath: string): Promise<boolean> {
    try {
      const fileHandle = await fs.open(filePath, 'r+');
      await fileHandle.close();
      return true;
    } catch {
      return false;
    }
  }

  private delay(ms: number): Promise<boolean> {
    return new Promise(resolve => setTimeout(() => resolve(false), ms));
  }
}
