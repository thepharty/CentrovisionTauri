/**
 * Helper functions for local file storage via Tauri commands
 * Uses SMB share on clinic server for offline file access
 */

import { invoke } from '@tauri-apps/api/core';

// Check if running in Tauri
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export interface LocalStorageStatus {
  enabled: boolean;
  smb_path: string | null;
  is_accessible: boolean;
}

export interface LocalStorageResult {
  success: boolean;
  local_path: string;
  bucket: string;
  file_path: string;
}

/**
 * Check if local storage is available and accessible
 */
export async function getLocalStorageStatus(): Promise<LocalStorageStatus> {
  if (!isTauri()) {
    return { enabled: false, smb_path: null, is_accessible: false };
  }

  try {
    return await invoke<LocalStorageStatus>('get_local_storage_status');
  } catch (error) {
    console.error('[LocalStorage] Error checking status:', error);
    return { enabled: false, smb_path: null, is_accessible: false };
  }
}

/**
 * Read a file from local storage and return as base64 data URL
 * @param bucket - Storage bucket name (e.g., 'results', 'studies')
 * @param filePath - Path to file within bucket
 * @returns Base64 data URL or null if file not found
 */
export async function readFileAsDataUrl(
  bucket: string,
  filePath: string
): Promise<string | null> {
  if (!isTauri()) {
    console.warn('[LocalStorage] Not running in Tauri');
    return null;
  }

  try {
    console.log(`[LocalStorage] Reading file: ${bucket}/${filePath}`);

    // Read file as bytes
    const bytes = await invoke<number[]>('read_file_from_local_storage', {
      bucket,
      filePath,
    });

    if (!bytes || bytes.length === 0) {
      console.warn(`[LocalStorage] File empty or not found: ${bucket}/${filePath}`);
      return null;
    }

    // Convert bytes to base64
    const uint8Array = new Uint8Array(bytes);
    const base64 = uint8ArrayToBase64(uint8Array);

    // Determine MIME type from extension
    const mimeType = getMimeType(filePath);

    console.log(`[LocalStorage] Read ${bytes.length} bytes, MIME: ${mimeType}`);

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error(`[LocalStorage] Error reading file ${bucket}/${filePath}:`, error);
    return null;
  }
}

/**
 * Upload a file to local storage
 * @param bucket - Storage bucket name
 * @param filePath - Destination path within bucket
 * @param file - File object to upload
 * @returns Upload result or null on error
 */
export async function uploadFileToLocal(
  bucket: string,
  filePath: string,
  file: File
): Promise<LocalStorageResult | null> {
  if (!isTauri()) {
    console.warn('[LocalStorage] Not running in Tauri');
    return null;
  }

  try {
    console.log(`[LocalStorage] Uploading file: ${bucket}/${filePath}`);

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));

    const result = await invoke<LocalStorageResult>('upload_file_to_local_storage', {
      bucket,
      filePath,
      fileData: bytes,
    });

    console.log(`[LocalStorage] Upload successful: ${result.local_path}`);
    return result;
  } catch (error) {
    console.error(`[LocalStorage] Error uploading file ${bucket}/${filePath}:`, error);
    return null;
  }
}

/**
 * Upload raw bytes to local storage
 * @param bucket - Storage bucket name
 * @param filePath - Destination path within bucket
 * @param data - Byte array to upload
 * @returns Upload result or null on error
 */
export async function uploadBytesToLocal(
  bucket: string,
  filePath: string,
  data: Uint8Array
): Promise<LocalStorageResult | null> {
  if (!isTauri()) {
    console.warn('[LocalStorage] Not running in Tauri');
    return null;
  }

  try {
    console.log(`[LocalStorage] Uploading ${data.length} bytes to: ${bucket}/${filePath}`);

    const bytes = Array.from(data);

    const result = await invoke<LocalStorageResult>('upload_file_to_local_storage', {
      bucket,
      filePath,
      fileData: bytes,
    });

    console.log(`[LocalStorage] Upload successful: ${result.local_path}`);
    return result;
  } catch (error) {
    console.error(`[LocalStorage] Error uploading bytes to ${bucket}/${filePath}:`, error);
    return null;
  }
}

/**
 * List files in a bucket/prefix from local storage
 * @param bucket - Storage bucket name
 * @param prefix - Optional path prefix to filter files
 * @returns Array of file paths
 */
export async function listLocalFiles(
  bucket: string,
  prefix?: string
): Promise<string[]> {
  if (!isTauri()) {
    return [];
  }

  try {
    return await invoke<string[]>('list_local_storage_files', {
      bucket,
      prefix: prefix || null,
    });
  } catch (error) {
    console.error(`[LocalStorage] Error listing files in ${bucket}/${prefix}:`, error);
    return [];
  }
}

// Helper: Convert Uint8Array to base64 string
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper: Get MIME type from file extension
function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  const mimeTypes: Record<string, string> = {
    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    tif: 'image/tiff',

    // Videos
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',

    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

    // Other
    json: 'application/json',
    txt: 'text/plain',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}
