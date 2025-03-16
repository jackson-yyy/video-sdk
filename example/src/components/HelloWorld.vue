<script setup lang="ts">
import { NButton, NUpload, type UploadFileInfo, NSwitch } from "naive-ui";
import { ref } from "vue";
import { useWebCodecs } from "../hooks/webcodecs/useWebCodecs";
import { Clipper, ClipperFFmpeg } from "@oops-av/clipper";

const isWebCodecs = ref(false);

const frames = ref<ThumbnailsResult>([]);

const handleChange = async (options: { fileList: UploadFileInfo[] }) => {
  const file = options.fileList[0];
  if (!file.file) return;
  const start = performance.now();
  const clipper = isWebCodecs.value
    ? new Clipper(file.file)
    : new ClipperFFmpeg(file.file);
  frames.value = (await clipper.thumbnails()).map((item) => ({
    blob: URL.createObjectURL(item.blob),
    time: (item.timestamp / 1e6).toFixed(3),
  }));
  console.log("耗时", performance.now() - start);
};
</script>

<template>
  <n-switch v-model:value="isWebCodecs">webcodecs</n-switch>
  <n-upload
    ref="upload"
    :default-upload="false"
    @change="handleChange"
    :multiple="false"
  >
    <n-button>选择文件</n-button>
  </n-upload>

  <div v-if="frames.length" style="display: flex; flex-wrap: wrap">
    {{ frames.length }} 张图片
    <div v-for="frame in frames" :key="frame">
      <img width="100" object-fit="cover" :src="frame.blob" />
      {{ frame.time }}
    </div>
  </div>
</template>
