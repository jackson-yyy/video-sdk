import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { BaseClipper, ThumbnailsOptions, ThumbnailsResult } from "./base";
import { normalizeThumbnailsOptions } from "./clipper";

const Workspace = "/workspace";
const taskId = Date.now();
const taskDir = `${Workspace}/${taskId}`;
const taskFilePath = `${taskDir}/file`;
const taskFrameDir = `${taskDir}/frames`;

function microsecondsToFFmpegTime(microseconds: number): string {
  // 将微秒转换为秒
  const seconds = microseconds / 1e6;

  // 计算小时、分钟、秒和毫秒
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds - Math.floor(seconds)) * 1000);

  // 格式化为 FFmpeg 时间格式
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function genClipFFmpegCommand(
  options: ReturnType<typeof normalizeThumbnailsOptions>
) {
  const { start, end, step, quality, width } = options;

  const command: string[] = [];

  if (step) {
    command.push();
  } else {
    command.push("-skip_frame", "nokey");
  }

  command.push("-i", taskFilePath);

  command.push("-ss", start ? microsecondsToFFmpegTime(start) : "0");

  if (end !== Infinity) {
    command.push("-to", microsecondsToFFmpegTime(end));
  }

  command.push(
    "-vsync",
    "vfr",
    "-frame_pts",
    "true",
    "-q:v",
    String(quality * 32),
    "-threads",
    "4",
    `${taskFrameDir}/frame_%09d.3f.png`
  );
  return command;
}

function extractTimestampInMicroseconds(filename: string): number {
  // 使用正则表达式提取时间戳
  const match = filename.match(/(\d+\.\d+)\.png/);
  if (match) {
    const seconds = parseFloat(match[1]); // 提取秒数
    return seconds * 1e6; // 转换为微秒
  }
  return -1;
}

export class ClipperFFmpeg extends BaseClipper {
  #ready: Promise<void>;
  #ffmpeg = new FFmpeg();

  constructor(protected source: File | Blob) {
    super(source);
    this.#ready = this.#init();
  }

  async #init() {
    const ffmpeg = this.#ffmpeg;

    const baseURL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm";
    ffmpeg.on("log", ({ message }) => {
      console.log(message);
    });
    // toBlobURL is used to bypass CORS issue, urls with the same
    // domain can be used directly.
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
      workerURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.worker.js`,
        "text/javascript"
      ),
    });
    ffmpeg.createDir(Workspace);
    ffmpeg.createDir(taskDir);
    ffmpeg.createDir(taskFrameDir);

    ffmpeg.writeFile(taskFilePath, await fetchFile(this.source));
  }

  async thumbnails(
    options: ThumbnailsOptions = {}
  ): Promise<ThumbnailsResult[]> {
    await this.#ready;

    const command = genClipFFmpegCommand(normalizeThumbnailsOptions(options));

    const code = await this.#ffmpeg.exec(command);
    if (code !== 0) throw new Error("Failed to extract frames");

    const ls = await this.#ffmpeg.listDir(taskFrameDir);

    const frames = await Promise.all(
      ls
        .filter((item) => !item.isDir)
        .map(async (file) => {
          const data = await this.#ffmpeg.readFile(
            `${taskFrameDir}/${file.name}`
          );
          await this.#ffmpeg.deleteFile(`${taskFrameDir}/${file.name}`);
          return {
            blob: new Blob([data], { type: "image/png" }),
            timestamp: extractTimestampInMicroseconds(file.name),
          };
        })
    );

    await this.#ffmpeg.deleteFile(taskFilePath);
    return frames;
  }

  seek(time: number): Promise<ThumbnailsResult> {}
}
