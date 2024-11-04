import { useCallback, useState, useRef, useEffect } from "react";

export const useMediaRecorder = (options: {
  onRecord?: (blob: Blob) => void;
  onStop?: (blob: Blob) => void;
  audioBitsPerSecond?: number;
  mimeType?: string;
}) => {
  const {
    onRecord,
    onStop,
    audioBitsPerSecond = 128000,
    mimeType = "audio/webm;codecs=pcm",
  } = options;

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const chunks = useRef<Blob[]>([]);
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
          if (blob.size > 0) {
            chunks.current?.push(blob); // store chunks
            onRecord?.(blob);
          }
        };

        recorder.onstop = () =>
          onStop?.(new Blob(chunks.current, { type: mimeType }));

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
  }, [onRecord, stop]);

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
};

export const useInt16PCMAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioData, setAudioData] = useState(null);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);

  const start = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        sourceRef.current =
          audioContextRef.current.createMediaStreamSource(stream);
        processorRef.current = audioContextRef.current.createScriptProcessor(
          8192,
          1,
          1,
        );

        processorRef.current.onaudioprocess = (e) => {
          if (!isPaused) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = convertToInt16PCM(inputData);
            setAudioData(pcmData);
          }
        };

        sourceRef.current.connect(processorRef.current);
        processorRef.current.connect(audioContextRef.current.destination);

        setIsRecording(true);
        setIsPaused(false);
      })
      .catch((error) => console.error("Error accessing microphone:", error));
  }, [isPaused]);

  const stop = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
  }, []);

  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);

  const convertToInt16PCM = (floatData) => {
    const pcmData = new Int16Array(floatData.length);
    for (let i = 0; i < floatData.length; i++) {
      const s = Math.max(-1, Math.min(1, floatData[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcmData;
  };

  useEffect(() => {
    return () => {
      if (isRecording) {
        stop();
      }
    };
  }, [isRecording, stop]);

  return {
    isRecording,
    isPaused,
    audioData,
    start,
    stop,
    pause,
    resume,
  };
};
