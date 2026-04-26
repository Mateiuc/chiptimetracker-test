import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { indexedDB } from '@/lib/indexedDB';
import { supabase } from '@/integrations/supabase/client';

const PHOTOS_DIR = 'task-photos';

/**
 * Photo Storage Service
 * 
 * Stores photos in the device filesystem (native) or IndexedDB (web).
 * Only file path references are stored in tasks, not the actual photo data.
 */
class PhotoStorageService {
  private isNative: boolean;
  private photoBlobStore: Map<string, string> = new Map(); // For web fallback in-memory cache

  constructor() {
    this.isNative = Capacitor.isNativePlatform();
  }

  /**
   * Generate a unique file path for a photo
   */
  private generateFilePath(taskId: string, photoId: string): string {
    return `${PHOTOS_DIR}/${taskId}/${photoId}.jpg`;
  }

  /**
   * Ensure the directory exists for the given path
   */
  private async ensureDirectory(taskId: string): Promise<void> {
    if (!this.isNative) return;

    try {
      await Filesystem.mkdir({
        path: `${PHOTOS_DIR}/${taskId}`,
        directory: Directory.Data,
        recursive: true,
      });
    } catch (error: any) {
      // Directory might already exist, which is fine
      if (!error.message?.includes('exists')) {
        console.warn('[PhotoStorage] Directory creation warning:', error);
      }
    }
  }

  /**
   * Save a photo to storage
   * @param base64 - The base64 encoded photo data (without data URI prefix)
   * @param taskId - The task ID this photo belongs to
   * @param photoId - Unique identifier for the photo
   * @returns The file path reference to store in the task
   */
  async savePhoto(base64: string, taskId: string, photoId: string): Promise<string> {
    const filePath = this.generateFilePath(taskId, photoId);

    if (this.isNative) {
      // Native: Save to filesystem
      await this.ensureDirectory(taskId);
      
      await Filesystem.writeFile({
        path: filePath,
        data: base64,
        directory: Directory.Data,
      });
      
      console.log(`[PhotoStorage] Saved photo to filesystem: ${filePath}`);
    } else {
      // Web: Save to IndexedDB using a custom store
      await this.savePhotoToIndexedDB(filePath, base64);
      console.log(`[PhotoStorage] Saved photo to IndexedDB: ${filePath}`);
    }

    return filePath;
  }

  /**
   * Load a photo from storage
   * @param filePath - The file path reference from the task
   * @returns The base64 encoded photo data
   */
  async loadPhoto(filePath: string): Promise<string | null> {
    try {
      if (this.isNative) {
        // Native: Read from filesystem
        const result = await Filesystem.readFile({
          path: filePath,
          directory: Directory.Data,
        });
        
        // Handle both string and Blob responses
        if (typeof result.data === 'string') {
          return result.data;
        } else {
          // Convert Blob to base64
          return await this.blobToBase64(result.data);
        }
      } else {
        // Web: Read from IndexedDB
        return await this.loadPhotoFromIndexedDB(filePath);
      }
    } catch (error) {
      console.error(`[PhotoStorage] Failed to load photo: ${filePath}`, error);
      return null;
    }
  }

  /**
   * Delete a single photo from storage
   * @param filePath - The file path reference from the task
   */
  async deletePhoto(filePath: string): Promise<void> {
    try {
      if (this.isNative) {
        await Filesystem.deleteFile({
          path: filePath,
          directory: Directory.Data,
        });
        console.log(`[PhotoStorage] Deleted photo: ${filePath}`);
      } else {
        await this.deletePhotoFromIndexedDB(filePath);
        console.log(`[PhotoStorage] Deleted photo from IndexedDB: ${filePath}`);
      }
    } catch (error) {
      console.warn(`[PhotoStorage] Failed to delete photo: ${filePath}`, error);
    }
  }

  /**
   * Delete all photos for a task
   * @param taskId - The task ID whose photos should be deleted
   */
  async deleteAllPhotosForTask(taskId: string): Promise<void> {
    const dirPath = `${PHOTOS_DIR}/${taskId}`;

    try {
      if (this.isNative) {
        await Filesystem.rmdir({
          path: dirPath,
          directory: Directory.Data,
          recursive: true,
        });
        console.log(`[PhotoStorage] Deleted all photos for task: ${taskId}`);
      } else {
        await this.deleteTaskPhotosFromIndexedDB(taskId);
        console.log(`[PhotoStorage] Deleted all photos for task from IndexedDB: ${taskId}`);
      }
    } catch (error) {
      console.warn(`[PhotoStorage] Failed to delete photos for task: ${taskId}`, error);
    }
  }

  /**
   * Load multiple photos at once (useful for PDF generation)
   * @param filePaths - Array of file path references
   * @returns Map of filePath -> base64 data
   */
  async loadMultiplePhotos(filePaths: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    
    await Promise.all(
      filePaths.map(async (filePath) => {
        const data = await this.loadPhoto(filePath);
        if (data) {
          results.set(filePath, data);
        }
      })
    );

    return results;
  }

  // ============= IndexedDB helpers for web platform =============

  private getPhotoDBName(): string {
    return 'photo-storage-db';
  }

  private async openPhotoDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(this.getPhotoDBName(), 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('photos')) {
          db.createObjectStore('photos', { keyPath: 'path' });
        }
      };
    });
  }

  private async savePhotoToIndexedDB(path: string, base64: string): Promise<void> {
    const db = await this.openPhotoDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      const store = tx.objectStore('photos');
      const request = store.put({ path, base64 });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });
  }

  private async loadPhotoFromIndexedDB(path: string): Promise<string | null> {
    const db = await this.openPhotoDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readonly');
      const store = tx.objectStore('photos');
      const request = store.get(path);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result?.base64 || null);
      };
      tx.oncomplete = () => db.close();
    });
  }

  private async deletePhotoFromIndexedDB(path: string): Promise<void> {
    const db = await this.openPhotoDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      const store = tx.objectStore('photos');
      const request = store.delete(path);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });
  }

  private async deleteTaskPhotosFromIndexedDB(taskId: string): Promise<void> {
    const db = await this.openPhotoDB();
    const prefix = `${PHOTOS_DIR}/${taskId}/`;
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      const store = tx.objectStore('photos');
      const request = store.openCursor();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          if (cursor.value.path.startsWith(prefix)) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove data URI prefix if present
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Compress an image before cloud upload
   */
  async compressImage(base64: string, maxWidth = 800, quality = 0.7): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context unavailable'));

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const compressed = dataUrl.split(',')[1];
        resolve(compressed);
      };
      img.onerror = reject;
      img.src = `data:image/jpeg;base64,${base64}`;
    });
  }

  /**
   * Upload a photo to cloud storage
   */
  async uploadPhotoToCloud(
    base64: string,
    taskId: string,
    photoId: string
  ): Promise<{ url: string; path: string }> {
    const compressed = await this.compressImage(base64);

    const { data, error } = await supabase.functions.invoke('upload-photo', {
      body: { base64: compressed, taskId, photoId },
    });

    if (error) {
      throw new Error(error.message || 'Failed to upload photo');
    }
    if (!data?.path) {
      throw new Error('Upload response missing path');
    }
    return { url: data.url as string, path: data.path as string };
  }

  /**
   * Mint short-lived signed URLs for a batch of private storage paths.
   * Returns a map of path -> signed URL for paths the caller is allowed to read.
   */
  async signPhotoUrls(paths: string[]): Promise<Record<string, string>> {
    if (!paths || paths.length === 0) return {};
    const { data, error } = await supabase.functions.invoke('sign-photo-urls', {
      body: { paths },
    });
    if (error) {
      console.warn('[PhotoStorage] sign-photo-urls failed:', error.message);
      return {};
    }
    return (data?.urls as Record<string, string>) || {};
  }
}

export const photoStorageService = new PhotoStorageService();
