import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import axios from 'axios';

export interface FileMetadata {
  size: number;
  contentType: string;
  acceptsRanges: boolean;
  checksum: string;
}

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
  speed: number;
  isComplete: boolean;
}

@Injectable()
export class DownloadService {
  private readonly logger = new Logger(DownloadService.name);

  /**
   * Get file metadata from the server
   */
  async getFileMetadata(fileId: string, serverUrl: string): Promise<FileMetadata> {
    try {
      const response = await axios.get(`${serverUrl}/file-info/${fileId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Error getting file metadata: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate SHA-256 checksum for a file
   */
  async calculateFileChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('error', err => reject(err));
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  /**
   * Download a file with progress tracking and validation
   */
  async downloadFile(
    fileId: string,
    serverUrl: string,
    outputPath: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    // Get file metadata first
    const metadata = await this.getFileMetadata(fileId, serverUrl);
    
    // Create write stream
    const writeStream = fs.createWriteStream(outputPath);
    
    // Download file with progress tracking
    const response = await axios({
      method: 'get',
      url: `${serverUrl}/download/${fileId}`,
      responseType: 'stream',
      onDownloadProgress: (progressEvent) => {
        if (onProgress) {
          const progress: DownloadProgress = {
            bytesDownloaded: progressEvent.loaded,
            totalBytes: metadata.size,
            percentage: (progressEvent.loaded / metadata.size) * 100,
            speed: progressEvent.rate || 0,
            isComplete: false
          };
          onProgress(progress);
        }
      }
    });

    // Pipe the response to the write stream
    response.data.pipe(writeStream);

    // Return a promise that resolves when the download is complete
    return new Promise((resolve, reject) => {
      writeStream.on('finish', async () => {
        try {
          // Verify file size
          const stats = await fs.promises.stat(outputPath);
          if (stats.size !== metadata.size) {
            throw new Error(`File size mismatch. Expected: ${metadata.size}, Got: ${stats.size}`);
          }

          // Verify checksum
          const downloadedChecksum = await this.calculateFileChecksum(outputPath);
          if (downloadedChecksum !== metadata.checksum) {
            throw new Error('Checksum verification failed');
          }

          if (onProgress) {
            onProgress({
              bytesDownloaded: metadata.size,
              totalBytes: metadata.size,
              percentage: 100,
              speed: 0,
              isComplete: true
            });
          }

          resolve();
        } catch (error) {
          reject(error);
        }
      });

      writeStream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Resume a partial download
   */
  async resumeDownload(
    fileId: string,
    serverUrl: string,
    outputPath: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    // Get file metadata
    const metadata = await this.getFileMetadata(fileId, serverUrl);
    
    // Get the size of the partially downloaded file
    const stats = await fs.promises.stat(outputPath);
    const startByte = stats.size;

    // Create write stream in append mode
    const writeStream = fs.createWriteStream(outputPath, { flags: 'a' });
    
    // Download remaining bytes with progress tracking
    const response = await axios({
      method: 'get',
      url: `${serverUrl}/download/${fileId}`,
      headers: {
        Range: `bytes=${startByte}-${metadata.size - 1}`
      },
      responseType: 'stream',
      onDownloadProgress: (progressEvent) => {
        if (onProgress) {
          const progress: DownloadProgress = {
            bytesDownloaded: startByte + progressEvent.loaded,
            totalBytes: metadata.size,
            percentage: ((startByte + progressEvent.loaded) / metadata.size) * 100,
            speed: progressEvent.rate || 0,
            isComplete: false
          };
          onProgress(progress);
        }
      }
    });

    // Pipe the response to the write stream
    response.data.pipe(writeStream);

    // Return a promise that resolves when the download is complete
    return new Promise((resolve, reject) => {
      writeStream.on('finish', async () => {
        try {
          // Verify file size
          const finalStats = await fs.promises.stat(outputPath);
          if (finalStats.size !== metadata.size) {
            throw new Error(`File size mismatch. Expected: ${metadata.size}, Got: ${finalStats.size}`);
          }

          // Verify checksum
          const downloadedChecksum = await this.calculateFileChecksum(outputPath);
          if (downloadedChecksum !== metadata.checksum) {
            throw new Error('Checksum verification failed');
          }

          if (onProgress) {
            onProgress({
              bytesDownloaded: metadata.size,
              totalBytes: metadata.size,
              percentage: 100,
              speed: 0,
              isComplete: true
            });
          }

          resolve();
        } catch (error) {
          reject(error);
        }
      });

      writeStream.on('error', (error) => {
        reject(error);
      });
    });
  }
} 