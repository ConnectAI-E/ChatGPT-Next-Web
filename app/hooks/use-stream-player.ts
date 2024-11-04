import { useCallback, useRef, useEffect, useState } from "react";

export const useInt16PCMAudioPlayer = ({ sampleRate = 24000 }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const bufferRef = useRef([]);
  const offset = useRef(0);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate });

      processorRef.current = audioContextRef.current.createScriptProcessor(
        8192,
        1,
        1,
      );
      processorRef.current.onaudioprocess = (e) => {
        const outputBuffer = e.outputBuffer;
        // only one channel
        const channelData = outputBuffer.getChannelData(0);

        if (bufferRef.current.length > 0) {
          for (let i = 0; i < channelData.length; i++) {
            if (offset.current < bufferRef.current?.length) {
              channelData[i] = bufferRef.current?.[offset.current++] / 0x8000; // Convert Int16 to Float32
            } else {
              channelData[i] = 0;
            }
          }
        } else {
          channelData.fill(0);
        }
      };

      // Connect the ScriptProcessorNode
      const silentSource = audioContextRef.current.createBufferSource();
      silentSource.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);
      silentSource.start();
    }
  }, []);

  const startPlaying = useCallback(() => {
    if (!isPlaying) {
      initAudioContext();
      // 确保 AudioContext 已启动
      Promise.resolve(
        audioContextRef.current.state === "suspended"
          ? audioContextRef.current.resume()
          : true,
      ).then(() => {
        setIsPlaying(true);
      });
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
      // append to bufferRef
      if (int16PCMData) {
        bufferRef.current.push.apply(
          bufferRef.current,
          new Int16Array(int16PCMData),
        );
        if (!isPlaying) {
          startPlaying();
        }
      }
    },
    [isPlaying, startPlaying],
  );

  useEffect(() => {
    return () => {
      if (processorRef.current) {
        processorRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
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
