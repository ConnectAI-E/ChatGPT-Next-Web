import { useDebouncedCallback } from "use-debounce";
import { useCallback, useRef, useEffect } from "react";

export const useStreamAudioPlayer = ({ sampleRate = 24000 }) => {
  const ctxRef = useRef<AudioContext>();
  const chunks = useRef<ArrayBuffer[]>([]);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentTime = useRef<number>(0);
  const startedAt = useRef<number>(0);

  function concat(buffer1, buffer2) {
    const numberOfChannels = Math.min(
      buffer1.numberOfChannels,
      buffer2.numberOfChannels,
    );
    const tmp = ctxRef.current?.createBuffer(
      numberOfChannels,
      buffer1.length + buffer2.length,
      buffer1.sampleRate,
    );
    for (var i = 0; i < numberOfChannels; i++) {
      var channel = tmp.getChannelData(i);
      channel.set(buffer1.getChannelData(i), 0);
      channel.set(buffer2.getChannelData(i), buffer1.length);
    }
    return tmp;
  }

  useEffect(() => {
    ctxRef.current = new AudioContext({ sampleRate });
    return () => ctxRef.current?.close();
  }, []);

  const handlePlay = useDebouncedCallback((value?: number) => {
    if (sourceRef.current) {
      handleStop();
    }
    if (ctxRef.current && bufferRef.current) {
      const source = (sourceRef.current = ctxRef.current?.createBufferSource());
      source.buffer = bufferRef.current;
      source.connect(ctxRef.current?.destination);
      startedAt.current = +new Date();
      source.start(0, value || currentTime.current);
    }
  }, 100);

  const handleStop = () => {
    try {
      sourceRef.current?.stop();
      sourceRef.disconnect(ctxRef.current);
      sourceRef.current = null;
    } catch (e) {}
    currentTime.current += (+new Date() - startedAt.current) / 1000;
  };

  const addArrayBuffer = (arrayBuffer: ArrayBuffer) => {
    chunks.current?.push(arrayBuffer);
    ctxRef.current?.decodeAudioData(arrayBuffer, (buffer: AudioBuffer) => {
      bufferRef.current = bufferRef.current
        ? concat(bufferRef.current, buffer)
        : buffer;
      handlePlay();
    });
  };

  const reset = () => {
    sourceRef.current = null;
    bufferRef.current = null;
    chunks.current = [];
  };

  const handleDownload = useCallback(async () => {
    if (!audioRef.current) return;
    const a = document.createElement("a");
    const mimeType = "audio/webm;codecs=pcm";
    a.href = URL.createObjectURL(new Blob(chunks.current, { type: mimeType }));
    a.download = "audio.mp3";
    a.click();
  }, []);

  const state = {
    chunks,
    download: handleDownload,
    add: addArrayBuffer,
    pause: handleStop,
    play: handlePlay,
    reset,
    setTime: (value: number) => handlePlay(value),
    stop: handleStop,
  };
  Object.defineProperties(state, {
    currentTime: {
      get() {
        return currentTime.current + (+new Date() - startedAt.current) / 1000;
      },
    },
    duration: {
      get() {
        return bufferRef.current?.duration;
      },
    },
    isPlaying: {
      get() {
        return ctxRef.current && ctxRef.current?.state === "running";
      },
    },
  });
  return state;
};
