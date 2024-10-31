import { useCallback, useState } from "react";
import { getRecordMimeType } from "@/app/utils/ger-recorder-mime-type";

export const useMediaRecorder = (options: {
  onBlobAvailable?: (blob: Blob) => void;
}) => {
  const { onBlobAvailable } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [time, setTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null,
  );
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(
    null,
  );
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const clearResources = useCallback(() => {
    if (url) {
      URL.revokeObjectURL(url);
      setUrl(null);
    }
    setBlob(null);
    setError(null);
  }, [url]);

  const _startTimer = useCallback(() => {
    const interval = setInterval(() => {
      setTime((prevTime) => prevTime + 1);
    }, 1000);
    setTimerInterval(interval);
  }, []);

  const _stopTimer = useCallback(() => {
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
  }, [timerInterval]);

  const pause = useCallback(() => {
    if (!mediaRecorder || !isRecording || isPaused) return;

    mediaRecorder.pause();
    setIsPaused(true);
    _stopTimer();
  }, [mediaRecorder, isRecording, isPaused, _stopTimer]);

  const resume = useCallback(() => {
    if (!mediaRecorder || !isRecording || !isPaused) return;

    mediaRecorder.resume();
    setIsPaused(false);
    _startTimer();
  }, [mediaRecorder, isRecording, isPaused, _startTimer]);

  const stop = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    _stopTimer();
    setTime(0);
    setIsRecording(false);
    setIsPaused(false);
  }, [mediaRecorder, _stopTimer]);

  const start = useCallback(() => {
    if (isRecording) return;
    clearResources();

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const recorder = new MediaRecorder(stream, {
          mimeType: getRecordMimeType().mimeType,
        });

        recorder.ondataavailable = (event) => {
          const blobData = event.data;
          setBlob(blobData);
          setUrl(URL.createObjectURL(blobData));
          onBlobAvailable?.(blobData);
          recorder.stream.getTracks().forEach((track) => track.stop());
          setMediaRecorder(null);
        };

        recorder.onerror = (event) => {
          // @ts-ignore
          setError(new Error("Recording failed: " + event.error));
          stop();
        };

        setMediaRecorder(recorder);
        setIsRecording(true);
        recorder.start();
        _startTimer();
      })
      .catch((error) => {
        setError(error);
        console.error("Error useAudioRecorder:", error);
      });
  }, [isRecording, clearResources, _startTimer, onBlobAvailable, stop]);

  return {
    blob,
    error,
    isRecording,
    isPaused,
    mediaRecorder,
    start,
    stop,
    pause,
    resume,
    time,
    url,
  };
};
