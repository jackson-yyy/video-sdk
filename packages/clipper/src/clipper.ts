import MP4Box from "mp4box";
import { tmpfile, write } from "opfs-tools";
import {
  Mp4Demuxer,
  type Mp4boxFile,
  type MP4Info,
  type MP4Sample,
} from "@oops-av/demuxer";
import { BaseClipper, ThumbnailsOptions, ThumbnailsResult } from "./base";

export function normalizeThumbnailsOptions(options: ThumbnailsOptions) {
  return {
    start: options.start ?? 0,
    end: options.end ?? Infinity,
    step: options.step,
    quality: options.quality ?? 1,
    mime: options.mime ?? "image/png",
    width: options.width,
  };
}

function parseVideoCodecConfig(
  mp4boxFile: Mp4boxFile,
  info: MP4Info
): VideoDecoderConfig {
  const track = info.videoTracks[0];
  if (!track) throw new Error("No video track found");
  const trackBox = mp4boxFile.getTrackById(track.id);

  const config = {
    codec: track.codec.startsWith("vp08") ? "vp8" : track.codec,
    codedHeight: track.video.height,
    codedWidth: track.video.width,
    description: new Uint8Array(), // 需要从视频文件中提取 avcC 数据
  };

  for (const entry of trackBox.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const stream = new MP4Box.DataStream(
        undefined,
        0,
        MP4Box.DataStream.BIG_ENDIAN
      );
      box.write(stream);
      config.description = new Uint8Array(stream.buffer, 8); // Remove the box header.
    }
  }

  return config;
}

export class Clipper extends BaseClipper {
  #ready: Promise<void>;
  #tmpFile = tmpfile();

  #videoCodecConfig?: VideoDecoderConfig;

  #videoSample: MP4Sample[] = [];

  constructor(protected source: File | Blob) {
    super(source);
    this.#ready = this.#init();
  }

  async #init() {
    await write(this.#tmpFile, this.source.stream());
    const demuxer = new Mp4Demuxer(
      this.#tmpFile,
      (mp4boxFile, info) => {
        this.#videoCodecConfig = parseVideoCodecConfig(mp4boxFile, info);
      },
      (_, sampleType, samples) => {
        if (sampleType === "video") {
          samples.forEach((sample) => {
            this.#videoSample.push({
              ...sample,
              data: null,
            });
          });
        }
      }
    );
    await demuxer.init();
  }

  async thumbnails(
    options: ThumbnailsOptions = {}
  ): Promise<ThumbnailsResult[]> {
    const _options = normalizeThumbnailsOptions(options);
    await this.#ready;
    if (!options.step) {
      return await this.#thumbnailsKeyframes(_options);
    }
    return [];
  }

  #thumbnailsKeyframes(
    options: ReturnType<typeof normalizeThumbnailsOptions>
  ): Promise<ThumbnailsResult[]> {
    return new Promise(async (resolve) => {
      const samples = this.#videoSample.filter(
        (sample) =>
          sample.is_sync &&
          sample.cts >= options.start &&
          sample.cts <= options.end
      );
      const results: ThumbnailsResult[] = [];
      const reader = await this.#tmpFile.createReader();

      const decoder = new VideoDecoder({
        output: async (vf) => {
          const { codedWidth, codedHeight } = vf;
          const width = options.width ?? codedWidth;
          const offScreenCanvas = new OffscreenCanvas(
            width,
            (width / codedWidth) * codedHeight
          );
          const ctx = offScreenCanvas.getContext("2d");
          ctx?.drawImage(vf, 0, 0);
          const blob = await offScreenCanvas.convertToBlob({
            type: options.mime,
            quality: options.quality,
          });
          results.push({
            blob,
            timestamp: vf.timestamp,
          });

          vf.close();

          if (results.length === samples.length) {
            decoder.close();
            resolve(results);
          }
        },
        error: (error) => {
          console.error(error);
        },
      });

      this.#videoCodecConfig && decoder.configure(this.#videoCodecConfig);

      for (const sample of samples) {
        const chunk = await reader.read(sample.size, { at: sample.offset });
        decoder.decode(
          new EncodedVideoChunk({
            type: "key",
            timestamp: sample.cts,
            duration: sample.duration,
            data: chunk,
          })
        );
      }
      decoder.flush();
    });
  }

  seek(time: number) {}
}
