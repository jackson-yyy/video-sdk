import type { OPFSFile } from "../../types";
// @ts-ignore
import mp4box from "mp4box";

export type Mp4boxFile = Record<string, any>;

export type MP4Info = Record<string, any>;

export interface MP4Sample {
  /**
   * sample 在文件中的起始位置（字节偏移量）。
   */
  offset: number;

  /**
   * sample 的大小（字节数）。
   */
  size: number;

  /**
   * sample 的持续时间（以时间刻度为单位）。
   */
  duration: number;

  /**
   * 解码时间戳（Composition Time Stamp），表示帧的显示时间。
   */
  cts: number;

  /**
   * 解码时间戳（Decoding Time Stamp），表示帧的解码时间。
   */
  dts: number;

  /**
   * 是否为关键帧（I 帧）。对于视频，关键帧可以独立解码。
   */
  is_sync: boolean;

  /**
   * 时间刻度，用于将 `duration` 转换为秒。
   */
  timescale: number;

  /**
   * 该 sample 所属的轨道 ID。
   */
  track_id: number;

  /**
   * 该 sample 的描述信息，通常包含编解码器的配置参数（如 SPS/PPS）。
   */
  description: {
    /**
     * 视频的 SPS（Sequence Parameter Set）。
     */
    sps?: Uint8Array;

    /**
     * 视频的 PPS（Picture Parameter Set）。
     */
    pps?: Uint8Array;

    /**
     * 音频的配置信息（如 AAC 的 AudioSpecificConfig）。
     */
    audioConfig?: Uint8Array;

    /**
     * 其他编解码器特定的配置信息。
     */
    [key: string]: any;
  };

  /**
   * sample 的原始数据（如果启用了提取数据选项）。
   */
  data?: ArrayBuffer | null;

  /**
   * sample 的序号（可选，某些情况下可能不存在）。
   */
  number?: number;

  /**
   * sample 的时间戳（以秒为单位，可选）。
   */
  timestamp?: number;

  /**
   * sample 的其他元数据（可选）。
   */
  [key: string]: any;
}

export class Mp4Demuxer {
  mp4boxFile: Mp4boxFile = mp4box.createFile();
  constructor(
    private file: OPFSFile,
    private onReady: (mp4boxFile: Mp4boxFile, info: MP4Info) => void,
    private onSamples: (
      id: number,
      sampleType: "video" | "audio",
      samples: MP4Sample[]
    ) => void
  ) {}

  async init() {
    this.mp4boxFile.onReady = (info: MP4Info) => {
      this.onReady(this.mp4boxFile, info);

      const videoTrackId = info.videoTracks[0]?.id;
      if (videoTrackId !== undefined || videoTrackId !== null) {
        this.mp4boxFile.setExtractionOptions(videoTrackId, "video", {
          nbSamples: 100,
        });
      }

      this.mp4boxFile.start();
    };

    this.mp4boxFile.onSamples = this.onSamples;

    await this.#parse();
  }

  async #parse() {
    const reader = await this.file.createReader();
    const maxChunkSize = 1024 * 1024 * 10;

    let offset = 0;
    while (true) {
      const chunk = await reader.read(maxChunkSize, { at: offset });
      if (chunk === null || chunk.byteLength === 0) {
        break;
      }
      chunk.fileStart = offset;
      this.mp4boxFile.appendBuffer(chunk);
      offset += chunk.byteLength;
    }
    reader.close();
    this.mp4boxFile.stop();
  }
}
