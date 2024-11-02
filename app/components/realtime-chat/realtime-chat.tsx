import VoiceIcon from "@/app/icons/voice.svg";
import VoiceOffIcon from "@/app/icons/voice-off.svg";

import Close24Icon from "@/app/icons/close-24.svg";
import styles from "./realtime-chat.module.scss";

import { useState, useEffect, useRef } from "react";
import { useStreamAudioPlayer } from "@/app/hooks/use-stream-player";
import { useMediaRecorder } from "@/app/hooks/use-media-recorder";
import { RealtimeClient } from "openai-realtime-api";

interface RealtimeChatProps {
  onClose?: () => void;
  onStartVoice?: () => void;
  onPausedVoice?: () => void;
}

export class WavPacker {
  _packData(size, arg) {
    return [
      new Uint8Array([arg, arg >> 8]),
      new Uint8Array([arg, arg >> 8, arg >> 16, arg >> 24]),
    ][size];
  }
  pack(sampleRate, audio) {
    if (!audio?.bitsPerSample) {
      throw new Error(`Missing "bitsPerSample"`);
    } else if (!audio?.channels) {
      throw new Error(`Missing "channels"`);
    } else if (!audio?.data) {
      throw new Error(`Missing "data"`);
    }
    const { bitsPerSample, channels, data } = audio;
    const output = [
      // Header
      "RIFF",
      this._packData(
        1,
        4 + (8 + 24) /* chunk 1 length */ + (8 + 8) /* chunk 2 length */,
      ), // Length
      "WAVE",
      // chunk 1
      "fmt ", // Sub-chunk identifier
      this._packData(1, 16), // Chunk length
      this._packData(0, 1), // Audio format (1 is linear quantization)
      this._packData(0, channels.length),
      this._packData(1, sampleRate),
      this._packData(1, (sampleRate * channels.length * bitsPerSample) / 8), // Byte rate
      this._packData(0, (channels.length * bitsPerSample) / 8),
      this._packData(0, bitsPerSample),
      // chunk 2
      "data", // Sub-chunk identifier
      this._packData(
        1,
        (channels[0].length * channels.length * bitsPerSample) / 8,
      ), // Chunk length
      data,
    ];
    const blob = new Blob(output, { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    return {
      blob,
      url,
      channelCount: channels.length,
      sampleRate,
      duration: data.byteLength / (channels.length * sampleRate * 2),
    };
  }
}

export function RealtimeChat({
  onClose,
  onStartVoice,
  onPausedVoice,
}: RealtimeChatProps) {
  const [isVoicePaused, setIsVoicePaused] = useState(true);
  const clientRef = useRef<RealtimeClient | null>(null);
  const currentItemId = useRef<string>("");

  const {
    add,
    reset,
    stop: stopPlayer,
    currentTime,
  } = useStreamAudioPlayer({ sampleRate: 24000 });
  const { error, start, isPaused, stop, pause, resume } = useMediaRecorder({
    onRecord(blob) {
      console.log("onRecord", blob);
      if (clientRef.current?.getTurnDetectionType() === "server_vad") {
        blob.arrayBuffer().then((audio) => {
          clientRef.current?.appendInputAudio(audio);
        });
      }
    },
  });

  useEffect(() => {
    // 这里直接下载一个mp3文件，拿到的arrayBuffer可以使用AudioContext.decodeAudioData解码，但是openai返回的数据，不管是base64转换之后，还是使用sdk里面拿到的Int16Array都报错：“EncodingError”
    // 现在使用openai那边的那个WavPacker尝试转换成能解析的文件buffer，
    // 后面考虑是不是传16BitPCM直接构造出AudioBuffer，添加到StreamPlayer.bufferRef后面，应该速度更快
    // fetch('https://mdn.github.io/webaudio-examples/decode-audio-data/callback/viper.mp3').then(res => res.arrayBuffer()).then(buffer => {
    //   console.log('buffer', buffer)
    //   add(buffer)
    // })
    const apiKey = prompt("OpenAI API Key");
    if (apiKey) {
      const client = (clientRef.current = new RealtimeClient({
        url: "wss://api.openai.com/v1/realtime",
        apiKey,
        dangerouslyAllowAPIKeyInBrowser: true,
        debug: true,
      }));
      client.connect().then(() => {
        // TODO 设置真实的上下文
        client.sendUserMessageContent([
          {
            type: `input_text`,
            text: `Hello`,
            // text: `For testing purposes, I want you to list ten car brands. Number each item, e.g. "one (or whatever number you are one): the item name".`
          },
        ]);

        client.on("realtime.event", (realtimeEvent: CustomRealtimeEvent) => {
          // 调试，可以在
          console.log("realtime.event", realtimeEvent);
        });

        client.on("response.audio_transcript.delta", async (e) => {
          // 小段文本，可以拼接
          console.log("response.audio_transcript.delta", e.delta);
        });
        client.on("response.done", async (e) => {
          // 整个文本
          console.log(
            "response.done",
            e.response.output?.[0]?.content?.[0]?.transcript,
          );
        });
        client.on("conversation.interrupted", async () => {
          if (currentItemId.current) {
            reset();
            await client.cancelResponse(trackId, currentTime);
          }
        });
        client.on("response.audio.delta", async (event: any) => {
          console.log("response.audio.delta", event);
        });
        client.on("conversation.updated", async (event: any) => {
          const { item, delta } = event;
          const items = client.conversation.getItems();
          if (delta?.audio) {
            if (currentItemId.current !== item.id) {
              currentItemId.current = item.id;
              reset();
            }
            // typeof delta.audio is Int16Array
            console.log("delta.audio", delta.audio, item, event);
            // add(delta.audio.buffer)
            const float32Array = new Float32Array(delta.audio.length);
            for (let i = 0; i < delta.audio.length; i++) {
              float32Array[i] = delta.audio[i] / 0x8000;
            }
            const audio = {
              bitsPerSample: 16,
              channels: [float32Array],
              data: delta.audio,
            };
            const packer = new WavPacker();
            const fromSampleRate = 24000;
            const wavFile = packer.pack(fromSampleRate, audio);
            console.log("packer.pack", wavFile);
            wavFile.blob.arrayBuffer().then((buffer) => {
              add(buffer);
            });
            // 这里将音频文件放到对象里面wavFile.url可以使用<audio>标签播放
            item.formatted.file = wavFile;
          }
          // setItems(items);
        });
      });
    }
    return () => {
      stop();
      // TODO close client
      clientRef.current?.disconnect();
    };
  }, []);

  const handleStartVoice = () => {
    onStartVoice?.();
    setIsVoicePaused(false);
    isPaused() ? resume() : start();
  };

  const handlePausedVoice = () => {
    onPausedVoice?.();
    setIsVoicePaused(true);
    pause();
  };

  return (
    <div className={styles["realtime-chat"]}>
      <div className={styles["circle-mic"]}>
        <div className={styles["icon-center"]}></div>
      </div>
      <div className={styles["bottom-icons"]}>
        <div className={styles["icon-left"]}>
          {isVoicePaused ? (
            <VoiceOffIcon onClick={handleStartVoice} />
          ) : (
            <VoiceIcon onClick={handlePausedVoice} />
          )}
        </div>
        <div className={styles["icon-right"]} onClick={onClose}>
          <Close24Icon />
        </div>
      </div>
    </div>
  );
}
