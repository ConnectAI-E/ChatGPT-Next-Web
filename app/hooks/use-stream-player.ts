import { useDebouncedCallback } from "use-debounce";
import { useCallback, useRef, useEffect, useState } from "react";

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

const useAudioPlayer = (sampleRate = 44100) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef(null);
  const bufferSourceRef = useRef(null);
  const bufferRef = useRef([]);
  const playIntervalRef = useRef(null);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        window.webkitAudioContext)({ sampleRate });
    }
  }, [sampleRate]);

  const playNextChunk = useCallback(() => {
    if (bufferRef.current.length > 0 && isPlaying) {
      const chunk = bufferRef.current.shift();
      const audioBuffer = audioContextRef.current.createBuffer(
        1,
        chunk.length,
        sampleRate,
      );
      const channelData = audioBuffer.getChannelData(0);

      for (let i = 0; i < chunk.length; i++) {
        channelData[i] = chunk[i] / 32768.0; // Convert Int16 to Float32
      }

      bufferSourceRef.current = audioContextRef.current.createBufferSource();
      bufferSourceRef.current.buffer = audioBuffer;
      bufferSourceRef.current.connect(audioContextRef.current.destination);
      bufferSourceRef.current.start();

      // Schedule next chunk
      setTimeout(playNextChunk, (chunk.length / sampleRate) * 1000);
    }
  }, [isPlaying, sampleRate]);

  const startPlaying = useCallback(() => {
    if (!isPlaying) {
      initAudioContext();
      setIsPlaying(true);
      playNextChunk();
    }
  }, [isPlaying, initAudioContext, playNextChunk]);

  const stopPlaying = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      if (bufferSourceRef.current) {
        bufferSourceRef.current.stop();
      }
      bufferRef.current = [];
    }
  }, [isPlaying]);

  const addInt16PCM = useCallback(
    (int16PCMData) => {
      bufferRef.current.push(new Int16Array(int16PCMData));
      if (isPlaying && bufferRef.current.length === 1) {
        playNextChunk();
      }
    },
    [isPlaying, playNextChunk],
  );

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    isPlaying,
    startPlaying,
    stopPlaying,
    addInt16PCM,
  };
};

export const useInt16PCMAudioPlayer = (sampleRate = 24000) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const bufferRef = useRef([]);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        window.webkitAudioContext)({ sampleRate });
      scriptProcessorRef.current =
        audioContextRef.current.createScriptProcessor(8192, 1, 1);

      scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
        console.log(
          "scriptProcessorRef.current.onaudioprocess",
          audioProcessingEvent,
        );
        const outputBuffer = audioProcessingEvent.outputBuffer;
        const channelData = outputBuffer.getChannelData(0);

        if (bufferRef.current.length > 0) {
          const chunk = bufferRef.current[0];
          const bytesPerSample = 2;
          const samplesPerChannel = chunk.length / bytesPerSample;

          for (let i = 0; i < channelData.length; i++) {
            if (i < samplesPerChannel) {
              // Convert Int16 to Float32
              const int16 =
                chunk[i * bytesPerSample] |
                (chunk[i * bytesPerSample + 1] << 8);
              channelData[i] = int16 / 32768.0;
            } else {
              channelData[i] = 0;
            }
          }

          // Remove the processed chunk
          bufferRef.current.shift();
        } else {
          channelData.fill(0);
        }
      };

      // Connect the ScriptProcessorNode
      const silentSource = audioContextRef.current.createBufferSource();
      silentSource.connect(scriptProcessorRef.current);
      scriptProcessorRef.current.connect(audioContextRef.current.destination);
      silentSource.start();
      console.log("initAudioContext", silentSource, scriptProcessorRef.current);
    }
  }, [sampleRate]);

  const startPlaying = useCallback(() => {
    if (!isPlaying) {
      initAudioContext();
      setIsPlaying(true);
    }
  }, [isPlaying, initAudioContext]);

  const stopPlaying = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      bufferRef.current = [];
    }
  }, [isPlaying]);

  const addInt16PCM = useCallback(
    (int16PCMData) => {
      bufferRef.current.push(new Int16Array(int16PCMData));
      console.log("addInt16PCM", bufferRef.current.length);
      if (!isPlaying) {
        startPlaying();
      }
    },
    [isPlaying, startPlaying],
  );

  useEffect(() => {
    return () => {
      if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    isPlaying,
    startPlaying,
    stopPlaying,
    addInt16PCM,
  };
};
