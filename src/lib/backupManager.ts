import { capacitorStorage } from './capacitorStorage';
import { exportToXML, parseXMLFile } from './xmlConverter';
import { toast as baseToast } from '@/hooks/use-toast';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { LocalNotifications } from '@capacitor/local-notifications';

// Wrapper that respects notification settings
const toast = async (options: Parameters<typeof baseToast>[0]) => {
  const settings = await capacitorStorage.getSettings();
  if (settings?.notificationsEnabled !== false) {
    return baseToast(options);
  }
  return { id: '', dismiss: () => {}, update: () => {} };
};

export class BackupManager {
  async createBackup(): Promise<string> {
    const data = await capacitorStorage.exportAllData();
    return exportToXML(data);
  }

  async exportBackup(): Promise<void> {
    try {
      const xmlContent = await this.createBackup();
      const fileName = `autotime_backup_${new Date().toISOString().split('T')[0].replace(/-/g, '')}_${Date.now()}.xml`;

      if (Capacitor.getPlatform() === 'web') {
        // Web: Download file
        const blob = new Blob([xmlContent], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Mobile: Save to cache and use Share API for native save dialog
        await Filesystem.writeFile({
          path: fileName,
          data: xmlContent,
          directory: Directory.Cache,
          encoding: Encoding.UTF8
        });

        const fileUri = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Cache
        });

        await Share.share({
          title: 'Export Backup',
          text: 'Save your AutoTime backup',
          url: fileUri.uri,
          dialogTitle: 'Save Backup File'
        });

        // Clean up cache file after sharing
        try {
          await Filesystem.deleteFile({
            path: fileName,
            directory: Directory.Cache
          });
        } catch (e) {
          console.log('Cache cleanup skipped');
        }
      }

      // Update last backup date
      const settings = await capacitorStorage.getSettings();
      await capacitorStorage.setSettings({
        ...settings,
        backup: {
          ...(settings.backup || {}),
          lastBackupDate: new Date().toISOString()
        }
      });

      if (Capacitor.getPlatform() === 'web') {
        toast({
          title: "Backup Complete",
          description: "Your backup has been downloaded.",
        });
      }
    } catch (error) {
      console.error('Export backup failed:', error);
      throw error;
    }
  }

  async importBackup(): Promise<void> {
    try {
      if (Capacitor.getPlatform() === 'web') {
        // Web: Use file input
        return new Promise((resolve, reject) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.xml';
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) {
              reject(new Error('No file selected'));
              return;
            }
            
            try {
              const data = await parseXMLFile(file);
              await capacitorStorage.importAllData(data);

              toast({
                title: "Backup Restored",
                description: "Your data has been successfully restored.",
              });

              window.dispatchEvent(new CustomEvent('chiptime:import-complete'));
              resolve();
            } catch (error) {
              reject(error);
            }
          };
          document.body.appendChild(input);
          input.click();
          document.body.removeChild(input);
        });
      } else {
        // Mobile: Use native file picker
        const result = await FilePicker.pickFiles({
          types: [
            'text/xml',
            'application/xml',
            'text/plain',              // Some systems detect .xml as plain text
            'application/octet-stream' // Common fallback on Android for long filenames
          ],
          readData: true
        });

        if (!result.files || result.files.length === 0) {
          return; // User cancelled - don't show error
        }

        const file = result.files[0];
        
        // Validate file extension (since MIME type can be unreliable on Android)
        if (!file.name.toLowerCase().endsWith('.xml')) {
          throw new Error('Please select an XML backup file (.xml)');
        }
        
        if (!file.data) {
          throw new Error('Could not read file data');
        }

        // Convert base64 to text
        const xmlContent = atob(file.data);
        
        // Parse XML string
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
        
        if (xmlDoc.querySelector('parsererror')) {
          throw new Error('Invalid XML file');
        }

        // Convert XML to DatabaseExport format (reuse parsing logic)
        const blob = new Blob([xmlContent], { type: 'text/xml' });
        const tempFile = new File([blob], 'backup.xml', { type: 'text/xml' });
        const data = await parseXMLFile(tempFile);
        
        await capacitorStorage.importAllData(data);

        toast({
          title: "Backup Restored",
          description: "Your data has been successfully restored.",
        });

        window.dispatchEvent(new CustomEvent('chiptime:import-complete'));
      }
    } catch (error) {
      console.error('Import backup failed:', error);
      throw error;
    }
  }

  async listLocalBackups(): Promise<Array<{ name: string; created: Date }>> {
    try {
      if (Capacitor.getPlatform() === 'web') {
        return [];
      }

      const result = await Filesystem.readdir({
        path: '',
        directory: Directory.Documents
      });

      const backupFiles = result.files
        .filter(file => 
          (file.name.startsWith('autotime_backup_') || file.name.startsWith('autotime-backup-')) && 
          file.name.endsWith('.xml')
        )
        .map(file => ({
          name: file.name,
          // Handle both new format (underscores) and old format (hyphens)
          created: new Date(parseInt(
            file.name.split('_').pop()?.replace('.xml', '') || 
            file.name.split('-').pop()?.replace('.xml', '') || '0'
          ))
        }))
        .sort((a, b) => b.created.getTime() - a.created.getTime());

      return backupFiles;
    } catch (error) {
      console.error('Failed to list backups:', error);
      return [];
    }
  }

  async cleanOldBackups(): Promise<void> {
    try {
      if (Capacitor.getPlatform() === 'web') {
        return;
      }

      const backups = await this.listLocalBackups();
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const oldBackups = backups.filter(backup => backup.created < oneWeekAgo);

      for (const backup of oldBackups) {
        try {
          await Filesystem.deleteFile({
            path: backup.name,
            directory: Directory.Documents
          });
          console.log(`Deleted old backup: ${backup.name}`);
        } catch (error) {
          console.error(`Failed to delete backup ${backup.name}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to clean old backups:', error);
    }
  }

  async createAutoBackup(): Promise<void> {
    try {
      const xmlContent = await this.createBackup();
      const fileName = `autotime_backup_${new Date().toISOString().split('T')[0].replace(/-/g, '')}_${Date.now()}.xml`;

      if (Capacitor.getPlatform() !== 'web') {
        await Filesystem.writeFile({
          path: fileName,
          data: xmlContent,
          directory: Directory.Documents,
          encoding: Encoding.UTF8
        });

        // Clean old backups after creating new one
        await this.cleanOldBackups();
      }

      // Update settings with success status
      const settings = await capacitorStorage.getSettings();
      await capacitorStorage.setSettings({
        ...settings,
        backup: {
          ...(settings.backup || {}),
          lastBackupDate: new Date().toISOString(),
          lastBackupStatus: 'success'
        }
      });

      console.log('Auto backup created successfully');
    } catch (error) {
      console.error('Auto backup failed:', error);
      
      // Update settings with failed status
      try {
        const settings = await capacitorStorage.getSettings();
        await capacitorStorage.setSettings({
          ...settings,
          backup: {
            ...(settings.backup || {}),
            lastBackupStatus: 'failed'
          }
        });
      } catch (e) {
        console.error('Failed to update backup status:', e);
      }

      // Send notification about failure
      await this.sendBackupFailureNotification();
      throw error;
    }
  }

  async exportLatestAutoBackup(): Promise<void> {
    try {
      if (Capacitor.getPlatform() === 'web') {
        throw new Error('Auto-backup export is only available on mobile');
      }

      // Get list of auto-backups
      const backups = await this.listLocalBackups();
      
      if (backups.length === 0) {
        throw new Error('No auto-backups found');
      }

      // Get the most recent backup
      const latestBackup = backups[0]; // Already sorted by date (newest first)

      // Read the backup file content
      const fileContent = await Filesystem.readFile({
        path: latestBackup.name,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });

      // Write to cache temporarily for sharing
      const tempFileName = latestBackup.name;
      await Filesystem.writeFile({
        path: tempFileName,
        data: fileContent.data,
        directory: Directory.Cache,
        encoding: Encoding.UTF8
      });

      // Get file URI for sharing
      const fileUri = await Filesystem.getUri({
        path: tempFileName,
        directory: Directory.Cache
      });

      // Open share dialog
      await Share.share({
        title: 'Export Auto-Backup',
        text: 'Save your latest auto-backup',
        url: fileUri.uri,
        dialogTitle: 'Save Backup File'
      });

      // Clean up cache file
      try {
        await Filesystem.deleteFile({
          path: tempFileName,
          directory: Directory.Cache
        });
      } catch (e) {
        console.log('Cache cleanup skipped');
      }
    } catch (error) {
      console.error('Export latest auto-backup failed:', error);
      throw error;
    }
  }

  async sendBackupFailureNotification(): Promise<void> {
    try {
      if (Capacitor.getPlatform() === 'web') {
        return;
      }

      // Request permission if needed
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }

      await LocalNotifications.schedule({
        notifications: [{
          title: 'Backup Failed',
          body: 'Auto-backup could not be completed. Please check the app.',
          id: Date.now(),
          schedule: { at: new Date(Date.now() + 1000) }
        }]
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }
}

export const backupManager = new BackupManager();
