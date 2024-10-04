import { StorageService } from '../src/storage/storage.service';
import * as fs from 'fs';
import { Dropbox } from 'dropbox';

jest.mock('fs');
jest.mock('dropbox');

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    service = new StorageService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadFile', () => {
    it('should call local upload when storageType is local', async () => {
      const uploadSpy = jest
        .spyOn(service as any, 'uploadLargeFileLocallyWithResuming')
        .mockImplementation(() => Promise.resolve());

      await service.uploadFile('test-path', 'destination-path', 'local');
      expect(uploadSpy).toHaveBeenCalledWith('test-path', 'destination-path');
    });

    it('should call Dropbox upload when storageType is dropbox', async () => {
      const dropboxUploadSpy = jest
        .spyOn(service as any, 'uploadLargeFileToDropboxWithResuming')
        .mockImplementation(() => Promise.resolve());

      await service.uploadFile('test-path', 'destination-path', 'dropbox');
      expect(dropboxUploadSpy).toHaveBeenCalledWith(
        'test-path',
        'destination-path',
      );
    });

    it('should throw an error for unsupported storage type', async () => {
      await expect(
        service.uploadFile('test-path', 'destination-path', 'unsupported'),
      ).rejects.toThrow('Unsupported storage type');
    });
  });

  describe('retrieveFile', () => {
    it('should retrieve file from local storage', async () => {
      const retrieveLocalSpy = jest
        .spyOn(service as any, 'retrieveLocalFile')
        .mockImplementation(() => Promise.resolve('local-file-path'));

      const result = await service.handleRetrieveFile('test-file', 'local');
      expect(retrieveLocalSpy).toHaveBeenCalledWith('test-file');
      expect(result).toBe('local-file-path');
    });

    it('should retrieve file from Dropbox', async () => {
      const retrieveDropboxSpy = jest
        .spyOn(service as any, 'retrieveDropboxFile')
        .mockImplementation(() => Promise.resolve('dropbox-file-link'));

      const result = await service.handleRetrieveFile('test-file', 'dropbox');
      expect(retrieveDropboxSpy).toHaveBeenCalledWith('test-file');
      expect(result).toBe('dropbox-file-link');
    });

    it('should throw an error for unsupported storage type', async () => {
      await expect(
        service.handleRetrieveFile('test-file', 'unsupported'),
      ).rejects.toThrow('Unsupported storage type');
    });
  });

  describe('deleteFile', () => {
    it('should delete file from local storage', async () => {
      const deleteLocalSpy = jest
        .spyOn(service as any, 'deleteLocalFile')
        .mockImplementation(() =>
          Promise.resolve({ message: 'File deleted successfully' }),
        );

      const result = await service.handleDeleteFile('test-file', 'local');
      expect(deleteLocalSpy).toHaveBeenCalledWith('test-file');
      expect(result).toEqual({ message: 'File deleted successfully' });
    });

    it('should delete file from Dropbox', async () => {
      const deleteDropboxSpy = jest
        .spyOn(service as any, 'deleteDropboxFile')
        .mockImplementation(() =>
          Promise.resolve({ message: 'File deleted from Dropbox' }),
        );

      const result = await service.handleDeleteFile('test-file', 'dropbox');
      expect(deleteDropboxSpy).toHaveBeenCalledWith('test-file');
      expect(result).toEqual({ message: 'File deleted from Dropbox' });
    });

    it('should throw an error for unsupported storage type', async () => {
      await expect(
        service.handleDeleteFile('test-file', 'unsupported'),
      ).rejects.toThrow('Unsupported storage type');
    });
  });
});
