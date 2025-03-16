import type { ThumbnailsOptions, ThumbnailsResult } from "./base";

export class Clipper {
  #worker: Worker;
  constructor(private source: File | Blob) {
    this.#worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
  }

  async thumbnails(
    options: ThumbnailsOptions = {}
  ): Promise<ThumbnailsResult[]> {
    this.#worker.postMessage({
      action: "extractFrames",
      data: {
        video: this.source,
        options,
      },
    });

    return new Promise<ThumbnailsResult[]>((resolve, reject) => {
      this.#worker.onmessage = (event) => {
        const { action, frames } = event.data;
        if (action === "extractFramesDone") {
          resolve(frames);
        } else if (action === "error") {
          reject(frames);
        }
      };
    });
  }
}

export * from "./clipperFFmpeg";
