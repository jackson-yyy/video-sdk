<script setup lang="ts">
import { NButton, NUpload, type UploadFileInfo } from "naive-ui";
import { ref } from "vue";
import { useWebCodecs } from "../hooks/webcodecs/useWebCodecs";
import { Clipper, ClipperFFmpeg } from "@oops-av/clipper";

const frames = ref<string[]>([]);

const handleChange = async (options: { fileList: UploadFileInfo[] }) => {
  const file = options.fileList[0];
  if (!file.file) return;
  const start = performance.now();
  const clipper = new Clipper(file.file);
  // const clipper = new ClipperFFmpeg(file.file);
  frames.value = (await clipper.thumbnails()).map((blob) =>
    URL.createObjectURL(blob.blob)
  );
  console.log("耗时", performance.now() - start);
};
</script>

<template>
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
      <img width="100" object-fit="cover" :src="frame" />
    </div>
  </div>
</template>
