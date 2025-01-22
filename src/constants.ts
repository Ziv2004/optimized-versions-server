import * as path from 'path';
import * as fs from 'fs';

export const CACHE_DIR = path.join(process.cwd(), 'cache');

// Ensure the cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}