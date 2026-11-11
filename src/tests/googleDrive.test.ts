import { describe, it, expect } from 'vitest';
import { driveName, drawingFileName, projectFolderName, folderLink, callbackUrl, DRIVE_SCOPE, DRIVE_ADMIN_ROLES } from '../../lib/googleDrive';

describe('Google Drive names and links', () => {
  it('names an approved drawing room first, with its version', () => {
    expect(drawingFileName('Master Bedroom', 'Wardrobe detail', 2)).toBe('Master Bedroom – Wardrobe detail v2.pdf');
    expect(drawingFileName('Study room', 'Study room – Bookshelf detail', 1)).toBe('Study room – Bookshelf detail v1.pdf');
    expect(drawingFileName('General / Project-Wide', 'Furniture Layout', 3)).toBe('Furniture Layout v3.pdf');
    expect(drawingFileName(null, 'Furniture Layout', 0)).toBe('Furniture Layout v1.pdf');
  });

  it('keeps names Drive can show: no slashes or control characters, never empty', () => {
    expect(driveName('A/B\\C')).toBe('A-B-C');
    expect(driveName('  Harmony\n704  ')).toBe('Harmony 704');
    expect(driveName('')).toBe('Untitled');
    expect(projectFolderName(undefined)).toBe('Project');
    expect(driveName('x'.repeat(300)).length).toBe(120);
  });

  it('asks only for the files the app makes, and lets only the studio\'s leads connect', () => {
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
    expect([...DRIVE_ADMIN_ROLES].sort()).toEqual(['Admin', 'Owner', 'Super Admin']);
  });

  it('links to the folder and back to the callback function', () => {
    expect(folderLink('abc')).toBe('https://drive.google.com/drive/folders/abc');
    expect(callbackUrl('gen-lang-client-0431334259')).toBe('https://us-central1-gen-lang-client-0431334259.cloudfunctions.net/driveOAuthCallback');
  });
});
