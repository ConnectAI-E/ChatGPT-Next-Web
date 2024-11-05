import { useCallback, useState, useRef, useEffect } from "react";

export const useInt16PCMAudioRecorder = ({ sampleRate = 24000 }) => {
  const isRecording = useRef(false);
  const isPaused = useRef(false);
  const [audioData, setAudioData] = useState<Int16Array | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const start = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate });
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        sourceRef.current =
          audioContextRef.current!.createMediaStreamSource(stream);
        processorRef.current = audioContextRef.current!.createScriptProcessor(
          8192,
          1,
          1,
        );

        processorRef.current.onaudioprocess = (e) => {
          if (isRecording.current && !isPaused.current) {
            // console.log('onaudioprocess', e, isRecording.current, isPaused.current)
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = convertToInt16PCM(inputData);
            setAudioData(pcmData);
          }
        };

        sourceRef.current.connect(processorRef.current);
        processorRef.current.connect(audioContextRef.current!.destination);
        isRecording.current = true;
        isPaused.current = false;
      })
      .catch((error) => console.error("Error accessing microphone:", error));
  }, [sampleRate]);

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
    // setIsRecording(false);
    // setIsPaused(false);
    isRecording.current = false;
    isPaused.current = false;
  }, []);

  const pause = useCallback(() => {
    isPaused.current = true;
    // setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    isPaused.current = false;
    // setIsPaused(false);
  }, []);

  const convertToInt16PCM = (floatData: Float32Array) => {
    const pcmData = new Int16Array(floatData.length);
    for (let i = 0; i < floatData.length; i++) {
      const s = Math.max(-1, Math.min(1, floatData[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcmData;
  };

  useEffect(() => {
    return () => {
      if (isRecording.current) {
        stop();
      }
    };
  }, [stop]);

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
