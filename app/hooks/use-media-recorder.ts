import { useCallback, useState, useRef } from "react";

// https://platform.openai.com/docs/guides/realtime?text-generation-quickstart-example=stream
function base64EncodeAudio(blob) {
  let binary = "";
  let bytes = new Uint8Array(blob.arrayBuffer());
  const chunkSize = 0x8000; // 32KB chunk size
  for (let i = 0; i < bytes.length; i += chunkSize) {
    let chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

export const useMediaRecorder = (options: {
  onRecord?: (blob: Blob) => void;
  audioBitsPerSecond?: number;
  mimeType?: string;
}) => {
  const {
    onRecord,
    audioBitsPerSecond = 128000,
    mimeType = "audio/webm;codecs=pcm",
  } = options;

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const pause = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current?.state === "recording") {
      mediaRecorder.current?.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current?.state === "paused") {
      mediaRecorder.current?.resume();
    }
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorder.current) {
      if (mediaRecorder.current?.state !== "inactive") {
        mediaRecorder.current?.stop();
      }
      mediaRecorder.current = null;
    }
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
  }, []);

  const start = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current?.state !== "inactive")
      return;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const recorder = (mediaRecorder.current = new MediaRecorder(stream, {
          mimeType,
          audioBitsPerSecond,
        }));

        recorder.ondataavailable = (event) => {
          const blob = event.data;
          const base64 = base64EncodeAudio(blob);
          onRecord?.({ blob, base64 });
        };

        recorder.onerror = (event) => {
          // @ts-ignore
          setError(new Error("Recording failed: " + event.error));
          stop();
        };

        recorder.start();
        // 128000 / 20 = 6400
        timerInterval.current = setInterval(() => {
          // https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/requestData
          // when call `requestData()`, Raise a dataavailable event with blob(captured data), and create new blob.
          if (
            mediaRecorder.current &&
            mediaRecorder.current?.state === "recording"
          ) {
            mediaRecorder.current.requestData();
          }
        }, 50);
      })
      .catch((error) => {
        setError(error);
        console.error("Error useAudioRecorder:", error);
      });
  }, [onBlobAvailable, stop]);

  return {
    error,
    mediaRecorder,
    isPaused: () => mediaRecorder.current?.state === "paused",
    isRecording: () =>
      mediaRecorder.current && mediaRecorder.current?.state !== "inactive",
    start,
    stop,
    pause,
    resume,
  };
  return state;
};
