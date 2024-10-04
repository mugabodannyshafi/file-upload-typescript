import * as fs from "fs";
import * as path from "path";
import { createReadStream, createWriteStream } from "fs";
import { Dropbox } from "dropbox";

export class StorageService {
  private readonly CHUNK_SIZE = 8 * 1024 * 1024;
  private readonly uploadsDir = path.join(__dirname, "../uploads");
  private readonly dropbox = new Dropbox({
    accessToken: process.env.DROPBOX_ACCESS_TOKEN,
  });

  constructor() {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async uploadFile(
    filePath: string,
    destinationPath: string,
    storageType: string
  ): Promise<void> {
    if (storageType === "local") {
      await this.uploadLargeFileLocallyWithResuming(filePath, destinationPath);
    } else if (storageType === "dropbox") {
      console.log("HELLO");
      await this.uploadLargeFileToDropboxWithResuming(
        filePath,
        destinationPath
      );
    } else {
      throw new Error("Unsupported storage type");
    }
  }

  private async uploadLargeFileLocallyWithResuming(
    filePath: string,
    destinationPath: string
  ): Promise<void> {
    const fileSize = fs.statSync(filePath).size;
    const fileStream = createReadStream(filePath, {
      highWaterMark: this.CHUNK_SIZE,
    });
    const destinationFilePath = path.join(this.uploadsDir, destinationPath);
    let uploadedBytes = 0;

    console.log(
      `Starting resumable upload for local storage: ${filePath}, size: ${fileSize} bytes`
    );

    const writeStream = createWriteStream(destinationFilePath, { flags: "a" });

    try {
      for await (const chunk of fileStream) {
        writeStream.write(chunk);
        uploadedBytes += chunk.length;

        console.log(
          `Appended ${chunk.length} bytes, total uploaded: ${uploadedBytes} bytes`
        );

        await this.delay(500);
      }

      writeStream.end();
      console.log(`Upload complete for local file: ${destinationFilePath}`);
    } catch (error: any) {
      console.error(`Error during resumable local upload: ${error.message}`);
      throw new Error("Local file upload failed: " + error.message);
    }
  }

  async uploadLargeFileToDropboxWithResuming(
    filePath: string,
    destinationPath: string
  ): Promise<void> {
    console.log("filepath", filePath);
    const fileSize = fs.statSync(filePath).size;
    const fileStream = createReadStream(filePath, {
      highWaterMark: this.CHUNK_SIZE,
    });
    let sessionId: string | null = null;
    let uploadedBytes = 0;
    const maxRetries = 5;
    const baseDelay = 1000;

    console.log(
      `Starting resumable upload for Dropbox: ${filePath}, size: ${fileSize} bytes`
    );

    try {
      for await (const chunk of fileStream) {
        let attempt = 0;
        let success = false;

        while (attempt <= maxRetries && !success) {
          try {
            if (!sessionId) {
              const startResponse = await this.dropbox.filesUploadSessionStart({
                close: false,
                contents: chunk,
              });
              sessionId = startResponse.result.session_id;
              console.log(`Started upload session with ID: ${sessionId}`);
            } else {
              await this.dropbox.filesUploadSessionAppendV2({
                cursor: {
                  session_id: sessionId,
                  offset: uploadedBytes,
                },
                contents: chunk,
              });
              console.log(
                `Appended ${chunk.length} bytes, total uploaded: ${
                  uploadedBytes + chunk.length
                } bytes`
              );
            }

            uploadedBytes += chunk.length;
            success = true;
          } catch (error: any) {
            attempt++;
            console.error(`Attempt ${attempt} failed: ${error.message}`);
            if (attempt > maxRetries) {
              console.error("Max retries reached. Aborting upload.");
              throw new Error(
                "File upload failed after multiple retries: " + error.message
              );
            }
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`Retrying in ${delay}ms...`);
            await this.delay(delay);
          }
        }
      }

      await this.dropbox.filesUploadSessionFinish({
        cursor: {
          session_id: sessionId!,
          offset: uploadedBytes,
        },
        commit: {
          path: destinationPath,
          mode: { ".tag": "overwrite" },
        },
      });

      console.log(`Upload complete: ${destinationPath}`);
    } catch (error: any) {
      console.error(
        `Error during Dropbox upload: ${destinationPath}, ${error.message}`
      );
      throw new Error("Dropbox upload failed: " + error.message);
    }
  }
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async handleRetrieveFile(fileName: string, type: string) {
    if (type === "dropbox") {
      console.log("--> filename", fileName);
      console.log("--> type", type);
      const result = await this.retrieveDropboxFile(fileName);
      return result;
    } else if (type === "local") {
      const result = await this.retrieveLocalFile(fileName);
      console.log("<<<Result>>>", result);
      return result;
    } else {
      throw new Error("Unsupported storage type");
    }
  }
  async retrieveLocalFile(fileName: string): Promise<any> {
    try {
      const filePath = path.join(this.uploadsDir, fileName);
      if (fs.existsSync(filePath)) {
        console.log(`File found locally: ${fileName}`);
        return filePath;
      } else {
        console.log("File not found");
      }
    } catch (error: any) {
      console.error(`Error retrieving file: ${fileName}`, error.stack);
    }
  }
  async retrieveDropboxFile(fileName: string): Promise<any> {
    try {
      const response = await this.dropbox.filesGetTemporaryLink({
        path: `/${fileName}`,
      });
      return response.result.link;
    } catch (error: any) {
      console.error(`Error retrieving file: ${fileName}`, error.stack);
    }
  }

  async deleteDropboxFile(fileName: string): Promise<any> {
    try {
      const response = await this.dropbox.filesDeleteV2({
        path: `/${fileName}`,
      });
      return response;
    } catch (error: any) {
      console.error(`Error deleting file: ${fileName}`, error.stack);
    }
  }

  async deleteLocalFile(fileName: string): Promise<any> {
    try {
      const filePath = path.join(this.uploadsDir, fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`File deleted: ${fileName}`);
        return { message: "File deleted successfully" };
      } else {
        console.log("File not found");
      }
    } catch (error: any) {
      console.error(`Error deleting file: ${fileName}`, error.stack);
    }
  }

  async handleDeleteFile(fileName: string, type: string) {
    if (type === "dropbox") {
      const result = await this.deleteDropboxFile(fileName);
      return result;
    } else if (type === "local") {
      const result = await this.deleteLocalFile(fileName);
      return result;
    } else {
      throw new Error("Unsupported storage type");
    }
  }
}
