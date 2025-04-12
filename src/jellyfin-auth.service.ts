import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JellyfinAuthService {
  constructor(private configService: ConfigService) {}

  async validateCredentials(authHeader: string): Promise<boolean> {
    const jellyfinUrl = this.configService.get<string>('JELLYFIN_URL');
    try {
      // Handle both formats:
      // 1. Just the token: "00d5ba4119a84be99adcf041b94474fd"
      // 2. With prefix: "MediaBrowser Token=00d5ba4119a84be99adcf041b94474fd"
      const token = authHeader.includes('MediaBrowser Token=')
        ? authHeader.split('=')[1].trim()
        : authHeader.trim();
      
      const response = await axios.get(`${jellyfinUrl}/Users/Me`, {
        headers: { 
          'X-Emby-Token': token,
          'X-Emby-Client': 'OptimizedVersionsServer',
          'X-Emby-Client-Version': '1.0.0',
          'X-Emby-Device-Name': 'OptimizedVersionsServer',
          'X-Emby-Device-Id': 'OptimizedVersionsServer'
        },
      });
      return response.status === 200;
    } catch (error) {
      console.error('Jellyfin authentication error:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      return false;
    }
  }
}
