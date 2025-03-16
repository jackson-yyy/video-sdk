import { Clipper } from "./clipper";

self.onmessage = async (event) => {
  const { action, data } = event.data;
  if (action === "extractFrames") {
    const clipper = new Clipper(data.video);

    const frames = await clipper.thumbnails(data.options);
    self.postMessage({ action: "extractFramesDone", frames });
  }
};
